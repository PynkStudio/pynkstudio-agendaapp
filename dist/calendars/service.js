import { caldavBusy, discoverCalendars, ICLOUD_CALDAV } from "./caldav.js";
import { decryptJson, encryptJson, signState, verifyState } from "./crypto.js";
import { googleBusy } from "./google.js";
import { icsBusy, normalizeIcsUrl } from "./ics.js";
import { microsoftBusy } from "./microsoft.js";
import { authorizationUrl, exchangeCode, freshCredentials, oauthConfigured } from "./oauth.js";
import { CalendarAuthError, } from "./types.js";
const COLUMNS = "id, host_id, provider, account, credentials, status, last_error, last_synced_at";
function toPublic(r) {
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
export function createCalendarService(opts) {
    const cfg = opts.config ?? null;
    const http = () => cfg?.fetch ?? fetch;
    const cache = new Map();
    function requireCfg() {
        if (!cfg)
            throw new Error("calendars are not configured");
        if (cfg.credentialsKey.length < 32)
            throw new Error("calendars.credentialsKey must be at least 32 characters");
        return cfg;
    }
    async function insert(scope, hostId, provider, account, creds) {
        const db = opts.db();
        if (!db)
            return { ok: false, error: "unconfigured" };
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
        return { ok: true, connection: toPublic(data) };
    }
    async function fetchBusy(row, from, to) {
        const c = requireCfg();
        const creds = decryptJson(c.credentialsKey, row.credentials);
        switch (row.provider) {
            case "google":
            case "microsoft": {
                const fresh = await freshCredentials(c, row.provider, creds);
                const busy = row.provider === "google" ? await googleBusy(fresh.accessToken, from, to, http()) : await microsoftBusy(fresh.accessToken, from, to, http());
                return { busy, credentials: fresh === creds ? undefined : fresh };
            }
            case "caldav":
                return caldavBusy(creds, from, to, http());
            case "ics":
                return { busy: await icsBusy(creds.url, from, to, http()) };
        }
    }
    return {
        enabled: () => Boolean(cfg),
        /** Which providers can be offered in the settings page. */
        providers() {
            return {
                google: oauthConfigured(cfg, "google"),
                microsoft: oauthConfigured(cfg, "microsoft"),
                caldav: Boolean(cfg),
                ics: Boolean(cfg),
            };
        },
        async list(scope, hostId) {
            const db = opts.db();
            if (!db)
                return [];
            let q = db.from(opts.table).select(COLUMNS).eq("scope", scope);
            if (hostId)
                q = q.eq("host_id", hostId);
            const { data, error } = await q.order("created_at", { ascending: true });
            if (error) {
                opts.warn("calendar connections list failed", error);
                return [];
            }
            return data.map(toPublic);
        },
        startOAuth(scope, hostId, provider, returnTo) {
            const state = signState(opts.signingSecret, { scope, hostId, provider, returnTo });
            return authorizationUrl(requireCfg(), provider, state);
        },
        async finishOAuth(provider, code, stateToken) {
            const state = verifyState(opts.signingSecret, stateToken);
            if (!state || state.provider !== provider)
                return { ok: false, error: "invalid_state" };
            if (!code)
                return { ok: false, error: "denied", returnTo: state.returnTo };
            try {
                const { credentials, account } = await exchangeCode(requireCfg(), provider, code);
                const result = await insert(state.scope, state.hostId, provider, account, credentials);
                return { ...result, returnTo: state.returnTo };
            }
            catch (error) {
                opts.warn(`${provider} oauth exchange failed`, error);
                return { ok: false, error: "exchange_failed", returnTo: state.returnTo };
            }
        },
        /** Apple iCloud (app-specific password) or any CalDAV server. Verified before saving. */
        async connectCalDav(scope, hostId, input) {
            const username = input.username.trim();
            if (!username || !input.password)
                return { ok: false, error: "missing_credentials" };
            const creds = { server: (input.server?.trim() || ICLOUD_CALDAV).replace(/\/+$/, ""), username, password: input.password };
            try {
                creds.calendars = await discoverCalendars(creds, http());
            }
            catch (error) {
                return { ok: false, error: error instanceof CalendarAuthError ? "auth_failed" : "unreachable" };
            }
            if (!creds.calendars.length)
                return { ok: false, error: "no_calendars" };
            return insert(scope, hostId, "caldav", username, creds);
        },
        /** A published iCalendar link. Verified before saving. */
        async connectIcs(scope, hostId, input) {
            let url;
            try {
                url = normalizeIcsUrl(input.url);
            }
            catch {
                return { ok: false, error: "invalid_url" };
            }
            try {
                const now = new Date();
                await icsBusy(url, now, new Date(now.getTime() + 86400000), http());
            }
            catch {
                return { ok: false, error: "unreachable" };
            }
            return insert(scope, hostId, "ics", input.label?.trim() || new URL(url).hostname, { url });
        },
        async remove(scope, id) {
            const db = opts.db();
            if (!db)
                return false;
            const { error } = await db.from(opts.table).delete().eq("id", id).eq("scope", scope);
            if (error)
                opts.warn("calendar connection delete failed", error);
            return !error;
        },
        /**
         * Busy intervals per host from their connected calendars. A calendar that
         * cannot be read is marked `error` and ignored (fail-open): the settings
         * page shows it, and availability keeps working on the other sources.
         */
        async busyByHost(scope, hostIds, from, to) {
            const out = new Map();
            const db = opts.db();
            if (!cfg || !db || hostIds.length === 0)
                return out;
            const { data, error } = await db.from(opts.table).select(COLUMNS).eq("scope", scope).in("host_id", hostIds);
            if (error) {
                opts.warn("calendar connections load failed", error);
                return out;
            }
            const ttl = (cfg.cacheSeconds ?? 120) * 1000;
            await Promise.all(data.map(async (row) => {
                const key = `${row.id}:${from.toISOString()}:${to.toISOString()}`;
                const hit = cache.get(key);
                let busy;
                if (hit && Date.now() - hit.at < ttl) {
                    busy = hit.busy;
                }
                else {
                    try {
                        const result = await fetchBusy(row, from, to);
                        busy = result.busy;
                        cache.set(key, { at: Date.now(), busy });
                        const patch = { status: "ok", last_error: null, last_synced_at: new Date().toISOString() };
                        if (result.credentials)
                            patch.credentials = encryptJson(requireCfg().credentialsKey, result.credentials);
                        const stale = !row.last_synced_at || Date.now() - Date.parse(row.last_synced_at) > 10 * 60000;
                        if (result.credentials || row.status !== "ok" || stale)
                            await db.from(opts.table).update(patch).eq("id", row.id);
                    }
                    catch (e) {
                        opts.warn(`calendar ${row.provider} ${row.id} unreadable`, e);
                        await db
                            .from(opts.table)
                            .update({ status: "error", last_error: String(e instanceof Error ? e.message : e).slice(0, 300) })
                            .eq("id", row.id);
                        busy = [];
                    }
                }
                out.set(row.host_id, [...(out.get(row.host_id) ?? []), ...busy]);
            }));
            return out;
        },
    };
}
//# sourceMappingURL=service.js.map