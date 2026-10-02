import type { AgendaEventType, AgendaHost, WeeklyWindow } from "../core/types.js";
import type { AgendaDb, AgendaTables } from "./config.js";
/** Keeps only well-formed windows: settings come from a browser form. */
export declare function sanitizeWindows(value: unknown): WeeklyWindow[];
/**
 * Applies the editable fields of a settings form onto a base event type.
 * Identity fields (id, timezone, location, calendar) stay those of the base.
 */
export declare function mergeEventTypeSettings(base: AgendaEventType, input: Record<string, unknown>): AgendaEventType;
export declare function createSettingsStore(opts: {
    db: () => AgendaDb | null;
    tables: AgendaTables;
    defaults: (scope: string) => readonly AgendaEventType[];
    warn: (message: string, error?: unknown) => void;
}): {
    eventTypes: (scope: string) => Promise<AgendaEventType[]>;
    hosts: (scope: string) => Promise<AgendaHost[]>;
    /** Saves the settings form of an event type (validated). */
    saveEventType(scope: string, id: string, input: Record<string, unknown>): Promise<AgendaEventType | {
        error: string;
    }>;
    /** Drops saved settings: the event type goes back to the code default. */
    resetEventType(scope: string, id: string): Promise<boolean>;
    /**
     * Mirrors the app's staff into hosts: creates missing ones, refreshes
     * names and emails, deactivates people no longer listed. Personal hours
     * and calendars are kept.
     */
    syncHosts(scope: string, people: ReadonlyArray<{
        externalId: string;
        name: string;
        email?: string | null;
    }>): Promise<AgendaHost[]>;
    /**
     * `writeTarget`: `null` stops writing; otherwise the connection must be
     * one of this host's (checked by the caller against the connections list).
     */
    updateHost(scope: string, id: string, patch: {
        active?: boolean;
        weekly?: unknown;
        writeTarget?: {
            connectionId: string;
            calendarId: string;
            calendarName?: string | null;
        } | null;
    }): Promise<AgendaHost | null>;
};
export type SettingsStore = ReturnType<typeof createSettingsStore>;
//# sourceMappingURL=settings.d.ts.map