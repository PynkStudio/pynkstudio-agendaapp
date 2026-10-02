import type { BusyInterval } from "../core/types.js";
import { caldavBusy, discoverCalendars, ICLOUD_CALDAV } from "./caldav.js";
import { decryptJson, encryptJson, signState, verifyState } from "./crypto.js";
import { googleBusy } from "./google.js";
import { icsBusy, normalizeIcsUrl } from "./ics.js";
import { microsoftBusy } from "./microsoft.js";
import { authorizationUrl, exchangeCode, freshCredentials, oauthConfigured } from "./oauth.js";
import {
  CalendarAuthError,
  type CalDavCredentials,
  type CalendarProvider,
  type CalendarsConfig,
  type IcsCredentials,
  type OAuthCredentials,
  type ProviderCredentials,
} from "./types.js";

type Db = { from: (table: string) => any };

export type CalendarConnection = {
  id: string;
  hostId: string;
  provider: CalendarProvider;
  account: string | null;
  status: "ok" | "error";
  lastError: string | null;
  lastSyncedAt: string | null;
};

type ConnectionRow = {
  id: string;
  host_id: string;
  provider: CalendarProvider;
  account: string | null;
  credentials: string;
  status: "ok" | "error";
  last_error: string | null;
  last_synced_at: string | null;
};

const COLUMNS = "id, host_id, provider, account, credentials, status, last_error, last_synced_at";

function toPublic(r: ConnectionRow): CalendarConnection {
  return {
    id: r.id,
    hostId: r.host_id,
    provider: r.provider,
    account: r.account,
    status: r.status,
    lastError: r.last_error,
    lastSyncedAt: r.last_synced_at,
  };
}

export type ConnectResult = { ok: true; connection: CalendarConnection } | { ok: false; error: string };

export function createCalendarService(opts: {
  db: () => Db | null;
  config: CalendarsConfig | null | undefined;
  signingSecret: string;
  table: string;
  warn: (message: string, error?: unknown) => void;
}) {
  const cfg = opts.config ?? null;
  const http = () => cfg?.fetch ?? fetch;
  const cache = new Map<string, { at: number; busy: BusyInterval[] }>();

  function requireCfg(): CalendarsConfig {
    if (!cfg) throw new Error("calendars are not configured");
    if (cfg.credentialsKey.length < 32) throw new Error("calendars.credentialsKey must be at least 32 characters");
    return cfg;
  }

  async function insert(scope: string, hostId: string, provider: CalendarProvider, account: string | null, creds: ProviderCredentials): Promise<ConnectResult> {
    const db = opts.db();
    if (!db) return { ok: false, error: "unconfigured" };
    const { data, error } = await db
      .from(opts.table)
      .insert({
        scope,
        host_id: hostId,
        provider,
        account,
        credentials: encryptJson(requireCfg().credentialsKey, creds),
        status: "ok",
        last_synced_at: new Date().toISOString(),
      })
      .select(COLUMNS)
      .single();
    if (error) {
      opts.warn("calendar connection insert failed", error);
      return { ok: false, error: "db_error" };
    }
    return { ok: true, connection: toPublic(data as ConnectionRow) };
  }

  async function fetchBusy(row: ConnectionRow, from: Date, to: Date): Promise<{ busy: BusyInterval[]; credentials?: ProviderCredentials }> {
    const c = requireCfg();
    const creds = decryptJson<ProviderCredentials>(c.credentialsKey, row.credentials);
    switch (row.provider) {
      case "google":
      case "microsoft": {
        const fresh = await freshCredentials(c, row.provider, creds as OAuthCredentials);
        const busy = row.provider === "google" ? await googleBusy(fresh.accessToken, from, to, http()) : await microsoftBusy(fresh.accessToken, from, to, http());
        return { busy, credentials: fresh === creds ? undefined : fresh };
      }
      case "caldav":
        return caldavBusy(creds as CalDavCredentials, from, to, http());
      case "ics":
        return { busy: await icsBusy((creds as IcsCredentials).url, from, to, http()) };
    }
  }

  return {
    enabled: () => Boolean(cfg),
    /** Which providers can be offered in the settings page. */
    providers(): Record<CalendarProvider, boolean> {
      return {
        google: oauthConfigured(cfg, "google"),
        microsoft: oauthConfigured(cfg, "microsoft"),
        caldav: Boolean(cfg),
        ics: Boolean(cfg),
      };
    },

    async list(scope: string, hostId?: string): Promise<CalendarConnection[]> {
      const db = opts.db();
      if (!db) return [];
      let q = db.from(opts.table).select(COLUMNS).eq("scope", scope);
      if (hostId) q = q.eq("host_id", hostId);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) {
        opts.warn("calendar connections list failed", error);
        return [];
      }
      return (data as ConnectionRow[]).map(toPublic);
    },

    startOAuth(scope: string, hostId: string, provider: "google" | "microsoft", returnTo?: string): string {
      const state = signState(opts.signingSecret, { scope, hostId, provider, returnTo });
      return authorizationUrl(requireCfg(), provider, state);
    },

    async finishOAuth(provider: "google" | "microsoft", code: string | null, stateToken: string | null): Promise<ConnectResult & { returnTo?: string }> {
      const state = verifyState(opts.signingSecret, stateToken);
      if (!state || state.provider !== provider) return { ok: false, error: "invalid_state" };
      if (!code) return { ok: false, error: "denied", returnTo: state.returnTo };
      try {
        const { credentials, account } = await exchangeCode(requireCfg(), provider, code);
        const result = await insert(state.scope, state.hostId, provider, account, credentials);
        return { ...result, returnTo: state.returnTo };
      } catch (error) {
        opts.warn(`${provider} oauth exchange failed`, error);
        return { ok: false, error: "exchange_failed", returnTo: state.returnTo };
      }
    },

    /** Apple iCloud (app-specific password) or any CalDAV server. Verified before saving. */
    async connectCalDav(scope: string, hostId: string, input: { server?: string; username: string; password: string }): Promise<ConnectResult> {
      const username = input.username.trim();
      if (!username || !input.password) return { ok: false, error: "missing_credentials" };
      const creds: CalDavCredentials = { server: (input.server?.trim() || ICLOUD_CALDAV).replace(/\/+$/, ""), username, password: input.password };
      try {
        creds.calendars = await discoverCalendars(creds, http());
      } catch (error) {
        return { ok: false, error: error instanceof CalendarAuthError ? "auth_failed" : "unreachable" };
      }
      if (!creds.calendars.length) return { ok: false, error: "no_calendars" };
      return insert(scope, hostId, "caldav", username, creds);
    },

    /** A published iCalendar link. Verified before saving. */
    async connectIcs(scope: string, hostId: string, input: { url: string; label?: string }): Promise<ConnectResult> {
      let url: string;
      try {
        url = normalizeIcsUrl(input.url);
      } catch {
        return { ok: false, error: "invalid_url" };
      }
      try {
        const now = new Date();
        await icsBusy(url, now, new Date(now.getTime() + 86400000), http());
      } catch {
        return { ok: false, error: "unreachable" };
      }
      return insert(scope, hostId, "ics", input.label?.trim() || new URL(url).hostname, { url });
    },

    async remove(scope: string, id: string): Promise<boolean> {
      const db = opts.db();
      if (!db) return false;
      const { error } = await db.from(opts.table).delete().eq("id", id).eq("scope", scope);
      if (error) opts.warn("calendar connection delete failed", error);
      return !error;
    },

    /**
     * Busy intervals per host from their connected calendars. A calendar that
     * cannot be read is marked `error` and ignored (fail-open): the settings
     * page shows it, and availability keeps working on the other sources.
     */
    async busyByHost(scope: string, hostIds: readonly string[], from: Date, to: Date): Promise<Map<string, BusyInterval[]>> {
      const out = new Map<string, BusyInterval[]>();
      const db = opts.db();
      if (!cfg || !db || hostIds.length === 0) return out;
      const { data, error } = await db.from(opts.table).select(COLUMNS).eq("scope", scope).in("host_id", hostIds);
      if (error) {
        opts.warn("calendar connections load failed", error);
        return out;
      }
      const ttl = (cfg.cacheSeconds ?? 120) * 1000;
      await Promise.all(
        (data as ConnectionRow[]).map(async (row) => {
          const key = `${row.id}:${from.toISOString()}:${to.toISOString()}`;
          const hit = cache.get(key);
          let busy: BusyInterval[];
          if (hit && Date.now() - hit.at < ttl) {
            busy = hit.busy;
          } else {
            try {
              const result = await fetchBusy(row, from, to);
              busy = result.busy;
              cache.set(key, { at: Date.now(), busy });
              const patch: Record<string, unknown> = { status: "ok", last_error: null, last_synced_at: new Date().toISOString() };
              if (result.credentials) patch.credentials = encryptJson(requireCfg().credentialsKey, result.credentials);
              const stale = !row.last_synced_at || Date.now() - Date.parse(row.last_synced_at) > 10 * 60000;
              if (result.credentials || row.status !== "ok" || stale) await db.from(opts.table).update(patch).eq("id", row.id);
            } catch (e) {
              opts.warn(`calendar ${row.provider} ${row.id} unreadable`, e);
              await db
                .from(opts.table)
                .update({ status: "error", last_error: String(e instanceof Error ? e.message : e).slice(0, 300) })
                .eq("id", row.id);
              busy = [];
            }
          }
          out.set(row.host_id, [...(out.get(row.host_id) ?? []), ...busy]);
        }),
      );
      return out;
    },
  };
}

export type CalendarService = ReturnType<typeof createCalendarService>;
