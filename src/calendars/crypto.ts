import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function keyOf(secret: string): Buffer {
  return createHash("sha256").update(`agenda:credentials:${secret}`).digest();
}

/** AES-256-GCM. Output `v1.<base64url(iv|tag|ciphertext)>`. */
export function encryptJson(secret: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function decryptJson<T>(secret: string, payload: string): T {
  if (!payload.startsWith("v1.")) throw new Error("Unknown credentials format");
  const raw = Buffer.from(payload.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  return JSON.parse(text) as T;
}

export type OAuthState = { scope: string; hostId: string; provider: string; returnTo?: string };

/** Signed, expiring OAuth `state`, so the callback trusts scope and host without a session table. */
export function signState(secret: string, state: OAuthState, ttlSeconds = 900): string {
  const body = Buffer.from(JSON.stringify({ ...state, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", secret).update(`agenda:oauth:${body}`).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(secret: string, token: string | null | undefined): OAuthState | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(`agenda:oauth:${body}`).digest("base64url"));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState & { exp: number };
    if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { scope: parsed.scope, hostId: parsed.hostId, provider: parsed.provider, returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}
