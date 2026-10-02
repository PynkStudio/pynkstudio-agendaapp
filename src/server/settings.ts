import { assertValidEventType, MAX_CAPACITY } from "../core/availability.js";
import { HOLIDAY_CALENDARS } from "../core/holidays.js";
import { isDateISO, parseClock } from "../core/time.js";
import type { AgendaEventType, AgendaHost, LocationKind, WeeklyWindow } from "../core/types.js";
import type { AgendaDb, AgendaTables } from "./config.js";

const CACHE_MS = 15_000;

type HostRow = {
  id: string;
  scope: string;
  external_id: string | null;
  name: string;
  email: string | null;
  active: boolean;
  weekly: WeeklyWindow[] | null;
  write_connection_id?: string | null;
  write_calendar_id?: string | null;
  write_calendar_name?: string | null;
};

const HOST_COLUMNS = "id, scope, external_id, name, email, active, weekly, write_connection_id, write_calendar_id, write_calendar_name";

function toHost(r: HostRow): AgendaHost {
  return {
    id: r.id,
    scope: r.scope,
    externalId: r.external_id,
    name: r.name,
    email: r.email,
    active: r.active,
    weekly: r.weekly ?? null,
    writeTarget:
      r.write_connection_id && r.write_calendar_id
        ? { connectionId: r.write_connection_id, calendarId: r.write_calendar_id, calendarName: r.write_calendar_name ?? null }
        : null,
  };
}

function num(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : undefined;
}

/** Keeps only well-formed windows: settings come from a browser form. */
export function sanitizeWindows(value: unknown): WeeklyWindow[] {
  if (!Array.isArray(value)) return [];
  const out: WeeklyWindow[] = [];
  for (const w of value) {
    const day = Number(w?.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    try {
      if (parseClock(String(w.start)) >= parseClock(String(w.end))) continue;
    } catch {
      continue;
    }
    const capacity = num(w.capacity, 1, MAX_CAPACITY);
    out.push({ day: day as WeeklyWindow["day"], start: String(w.start), end: String(w.end), ...(capacity && capacity > 1 ? { capacity } : {}) });
  }
  return out;
}

/**
 * Applies the editable fields of a settings form onto a base event type.
 * Identity fields (id, timezone, location, calendar) stay those of the base.
 */
export function mergeEventTypeSettings(base: AgendaEventType, input: Record<string, unknown>): AgendaEventType {
  const next: AgendaEventType = { ...base };
  if (typeof input.title === "string" && input.title.trim()) next.title = input.title.trim().slice(0, 120);
  const duration = num(input.durationMinutes, 5, 8 * 60);
  if (duration) next.durationMinutes = duration;
  if (input.slotStepMinutes === null) delete next.slotStepMinutes;
  else {
    const step = num(input.slotStepMinutes, 5, 8 * 60);
    if (step) next.slotStepMinutes = step;
  }
  const buffer = num(input.bufferMinutes, 0, 240);
  if (buffer !== undefined) next.bufferMinutes = buffer;
  const notice = num(input.minNoticeMinutes, 0, 60 * 24 * 30);
  if (notice !== undefined) next.minNoticeMinutes = notice;
  const lookahead = num(input.lookaheadDays, 1, 365);
  if (lookahead) next.lookaheadDays = lookahead;
  if (Array.isArray(input.weekly)) next.weekly = sanitizeWindows(input.weekly);
  if (Array.isArray(input.closedDates)) {
    next.closedDates = [...new Set(input.closedDates.map(String).filter(isDateISO))].sort();
  }
  if (Array.isArray(input.holidays)) next.holidays = input.holidays.map(String).filter((c) => c in HOLIDAY_CALENDARS);
  const staffing = input.staffing as { mode?: unknown; hostIds?: unknown } | undefined;
  if (staffing?.mode === "seats") next.staffing = { mode: "seats" };
  if (staffing?.mode === "hosts") {
    next.staffing = { mode: "hosts", hostIds: Array.isArray(staffing.hostIds) ? staffing.hostIds.map(String) : [] };
  }
  if (input.location === "video" || input.location === "phone" || input.location === "in_person") {
    next.location = input.location as LocationKind;
  }
  assertValidEventType(next);
  return next;
}

export function createSettingsStore(opts: {
  db: () => AgendaDb | null;
  tables: AgendaTables;
  defaults: (scope: string) => readonly AgendaEventType[];
  warn: (message: string, error?: unknown) => void;
}) {
  const etCache = new Map<string, { at: number; list: AgendaEventType[] }>();
  const hostCache = new Map<string, { at: number; list: AgendaHost[] }>();
  const validated = new WeakSet<AgendaEventType>();

  function defaultsOf(scope: string): readonly AgendaEventType[] {
    const list = opts.defaults(scope);
    for (const et of list) {
      if (!validated.has(et)) {
        assertValidEventType(et);
        validated.add(et);
      }
    }
    return list;
  }

  async function eventTypes(scope: string): Promise<AgendaEventType[]> {
    const hit = etCache.get(scope);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
    const defaults = defaultsOf(scope);
    const db = opts.db();
    let saved: Array<{ id: string; settings: AgendaEventType }> = [];
    if (db) {
      const { data, error } = await db.from(opts.tables.eventTypes).select("id, settings").eq("scope", scope);
      // Without the table (migration 0002 not applied) the code defaults still work.
      if (error) opts.warn("event type settings unavailable, using defaults", error);
      else saved = data ?? [];
    }
    const byId = new Map(defaults.map((et) => [et.id, et]));
    for (const row of saved) {
      try {
        const merged = { ...(byId.get(row.id) ?? {}), ...row.settings, id: row.id } as AgendaEventType;
        assertValidEventType(merged);
        byId.set(row.id, merged);
      } catch (error) {
        opts.warn(`saved settings for event type ${row.id} are invalid, ignored`, error);
      }
    }
    const list = [...byId.values()];
    etCache.set(scope, { at: Date.now(), list });
    return list;
  }

  async function hosts(scope: string): Promise<AgendaHost[]> {
    const hit = hostCache.get(scope);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
    const db = opts.db();
    if (!db) return [];
    const { data, error } = await db
      .from(opts.tables.hosts)
      .select(HOST_COLUMNS)
      .eq("scope", scope)
      .order("name", { ascending: true });
    if (error) {
      opts.warn("hosts unavailable", error);
      return [];
    }
    const list = (data as HostRow[]).map(toHost);
    hostCache.set(scope, { at: Date.now(), list });
    return list;
  }

  return {
    eventTypes,
    hosts,

    /** Saves the settings form of an event type (validated). */
    async saveEventType(scope: string, id: string, input: Record<string, unknown>): Promise<AgendaEventType | { error: string }> {
      const db = opts.db();
      if (!db) return { error: "unconfigured" };
      const base = (await eventTypes(scope)).find((et) => et.id === id);
      if (!base) return { error: "unknown_event_type" };
      let next: AgendaEventType;
      try {
        next = mergeEventTypeSettings(base, input);
      } catch (error) {
        return { error: error instanceof Error ? error.message : "invalid_settings" };
      }
      const { error } = await db
        .from(opts.tables.eventTypes)
        .upsert({ scope, id, settings: next, updated_at: new Date().toISOString() }, { onConflict: "scope,id" });
      if (error) {
        opts.warn("saveEventType failed", error);
        return { error: "db_error" };
      }
      etCache.delete(scope);
      return next;
    },

    /** Drops saved settings: the event type goes back to the code default. */
    async resetEventType(scope: string, id: string): Promise<boolean> {
      const db = opts.db();
      if (!db) return false;
      const { error } = await db.from(opts.tables.eventTypes).delete().eq("scope", scope).eq("id", id);
      etCache.delete(scope);
      return !error;
    },

    /**
     * Mirrors the app's staff into hosts: creates missing ones, refreshes
     * names and emails, deactivates people no longer listed. Personal hours
     * and calendars are kept.
     */
    async syncHosts(scope: string, people: ReadonlyArray<{ externalId: string; name: string; email?: string | null }>): Promise<AgendaHost[]> {
      const db = opts.db();
      if (!db) return [];
      const current = await hosts(scope);
      const listed = new Set(people.map((p) => p.externalId));
      const rows = people.map((p) => ({ scope, external_id: p.externalId, name: p.name.trim() || p.externalId, email: p.email ?? null }));
      if (rows.length) {
        const { error } = await db.from(opts.tables.hosts).upsert(rows, { onConflict: "scope,external_id" });
        if (error) opts.warn("syncHosts upsert failed", error);
      }
      const gone = current.filter((h) => h.externalId && !listed.has(h.externalId) && h.active).map((h) => h.id);
      if (gone.length) await db.from(opts.tables.hosts).update({ active: false }).in("id", gone);
      hostCache.delete(scope);
      return hosts(scope);
    },

    /**
     * `writeTarget`: `null` stops writing; otherwise the connection must be
     * one of this host's (checked by the caller against the connections list).
     */
    async updateHost(
      scope: string,
      id: string,
      patch: { active?: boolean; weekly?: unknown; writeTarget?: { connectionId: string; calendarId: string; calendarName?: string | null } | null },
    ): Promise<AgendaHost | null> {
      const db = opts.db();
      if (!db) return null;
      const update: Record<string, unknown> = {};
      if (typeof patch.active === "boolean") update.active = patch.active;
      if (patch.weekly === null) update.weekly = null;
      else if (patch.weekly !== undefined) update.weekly = sanitizeWindows(patch.weekly);
      if (patch.writeTarget === null) {
        update.write_connection_id = null;
        update.write_calendar_id = null;
        update.write_calendar_name = null;
      } else if (patch.writeTarget) {
        update.write_connection_id = patch.writeTarget.connectionId;
        update.write_calendar_id = patch.writeTarget.calendarId.slice(0, 500);
        update.write_calendar_name = patch.writeTarget.calendarName?.slice(0, 200) ?? null;
      }
      const { data, error } = await db
        .from(opts.tables.hosts)
        .update(update)
        .eq("scope", scope)
        .eq("id", id)
        .select(HOST_COLUMNS)
        .maybeSingle();
      hostCache.delete(scope);
      if (error) {
        opts.warn("updateHost failed", error);
        return null;
      }
      return data ? toHost(data as HostRow) : null;
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
