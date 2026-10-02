import type { BusyInterval } from "../core/types.js";
import { type CalendarProvider, type CalendarsConfig, type HostEvent, type WritableCalendar } from "./types.js";
/** Where an event written for a booking lives, so it can be removed on cancellation. */
export type ExternalEventRef = {
    connectionId: string;
    provider: CalendarProvider;
    calendarId: string;
    eventId: string;
};
type Db = {
    from: (table: string) => any;
};
export type CalendarConnection = {
    id: string;
    hostId: string;
    provider: CalendarProvider;
    account: string | null;
    status: "ok" | "error";
    lastError: string | null;
    lastSyncedAt: string | null;
};
export type ConnectResult = {
    ok: true;
    connection: CalendarConnection;
} | {
    ok: false;
    error: string;
};
export declare function createCalendarService(opts: {
    db: () => Db | null;
    config: CalendarsConfig | null | undefined;
    signingSecret: string;
    table: string;
    warn: (message: string, error?: unknown) => void;
}): {
    enabled: () => boolean;
    /** Providers that can receive the bookings (ICS feeds are read-only). */
    writable: (provider: CalendarProvider) => provider is "google" | "microsoft" | "caldav";
    /** Calendars of a connection that can be chosen as destination for the assigned calls. */
    writableCalendars(scope: string, connectionId: string): Promise<WritableCalendar[] | {
        error: string;
    }>;
    /** Writes an event into a connection's calendar. */
    writeEvent(scope: string, connectionId: string, calendarId: string, event: HostEvent): Promise<ExternalEventRef>;
    deleteEvent(scope: string, ref: ExternalEventRef): Promise<void>;
    /** Which providers can be offered in the settings page. */
    providers(): Record<CalendarProvider, boolean>;
    list(scope: string, hostId?: string): Promise<CalendarConnection[]>;
    startOAuth(scope: string, hostId: string, provider: "google" | "microsoft", returnTo?: string): string;
    finishOAuth(provider: "google" | "microsoft", code: string | null, stateToken: string | null): Promise<ConnectResult & {
        returnTo?: string;
    }>;
    /** Apple iCloud (app-specific password) or any CalDAV server. Verified before saving. */
    connectCalDav(scope: string, hostId: string, input: {
        server?: string;
        username: string;
        password: string;
    }): Promise<ConnectResult>;
    /** A published iCalendar link. Verified before saving. */
    connectIcs(scope: string, hostId: string, input: {
        url: string;
        label?: string;
    }): Promise<ConnectResult>;
    remove(scope: string, id: string): Promise<boolean>;
    /**
     * Busy intervals per host from their connected calendars. A calendar that
     * cannot be read is marked `error` and ignored (fail-open): the settings
     * page shows it, and availability keeps working on the other sources.
     */
    busyByHost(scope: string, hostIds: readonly string[], from: Date, to: Date): Promise<Map<string, BusyInterval[]>>;
};
export type CalendarService = ReturnType<typeof createCalendarService>;
export {};
//# sourceMappingURL=service.d.ts.map