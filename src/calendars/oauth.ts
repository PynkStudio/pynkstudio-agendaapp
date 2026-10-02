import { CalendarAuthError, type CalendarsConfig, type OAuthClient, type OAuthCredentials } from "./types.js";

type Provider = "google" | "microsoft";

const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.freebusy"];
const MICROSOFT_SCOPES = ["openid", "email", "offline_access", "User.Read", "Calendars.Read"];

function client(cfg: CalendarsConfig, provider: Provider): OAuthClient & { tenant?: string } {
  const c = provider === "google" ? cfg.google : cfg.microsoft;
  if (!c?.clientId || !c.clientSecret) throw new CalendarAuthError(`${provider} is not configured`);
  return c;
}

function tokenUrl(cfg: CalendarsConfig, provider: Provider): string {
  return provider === "google"
    ? "https://oauth2.googleapis.com/token"
    : `https://login.microsoftonline.com/${cfg.microsoft?.tenant ?? "common"}/oauth2/v2.0/token`;
}

export function oauthConfigured(cfg: CalendarsConfig | null | undefined, provider: Provider): boolean {
  const c = provider === "google" ? cfg?.google : cfg?.microsoft;
  return Boolean(c?.clientId && c.clientSecret);
}

export function authorizationUrl(cfg: CalendarsConfig, provider: Provider, state: string): string {
  const c = client(cfg, provider);
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: cfg.redirectUri(provider),
    response_type: "code",
    state,
  });
  if (provider === "google") {
    params.set("scope", GOOGLE_SCOPES.join(" "));
    // Offline + consent: Google returns a refresh token only on a fresh consent.
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  params.set("scope", MICROSOFT_SCOPES.join(" "));
  params.set("response_mode", "query");
  params.set("prompt", "select_account");
  return `https://login.microsoftonline.com/${cfg.microsoft?.tenant ?? "common"}/oauth2/v2.0/authorize?${params}`;
}

function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    // Decoded, not verified: it arrives straight from the provider's token endpoint over TLS.
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return claims.email ?? claims.preferred_username ?? null;
  } catch {
    return null;
  }
}

async function tokenRequest(cfg: CalendarsConfig, provider: Provider, body: Record<string, string>) {
  const c = client(cfg, provider);
  const form = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body });
  if (provider === "microsoft") form.set("scope", MICROSOFT_SCOPES.join(" "));
  const res = await (cfg.fetch ?? fetch)(tokenUrl(cfg, provider), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== "string") {
    throw new CalendarAuthError(String(data.error_description ?? data.error ?? `token request failed (${res.status})`));
  }
  return data;
}

export async function exchangeCode(
  cfg: CalendarsConfig,
  provider: Provider,
  code: string,
): Promise<{ credentials: OAuthCredentials; account: string | null }> {
  const data = await tokenRequest(cfg, provider, {
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri(provider),
  });
  return {
    credentials: {
      accessToken: String(data.access_token),
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    },
    account: emailFromIdToken(data.id_token),
  };
}

/** A usable access token, refreshed when it expires within a minute. */
export async function freshCredentials(cfg: CalendarsConfig, provider: Provider, creds: OAuthCredentials): Promise<OAuthCredentials> {
  if (creds.expiresAt - 60_000 > Date.now()) return creds;
  if (!creds.refreshToken) throw new CalendarAuthError("access expired, reconnect the calendar");
  const data = await tokenRequest(cfg, provider, { grant_type: "refresh_token", refresh_token: creds.refreshToken });
  return {
    accessToken: String(data.access_token),
    // Microsoft rotates refresh tokens; Google usually does not return a new one.
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : creds.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
}
