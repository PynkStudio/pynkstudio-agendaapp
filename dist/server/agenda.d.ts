import type { AgendaBooking, AgendaEventType, AgendaSlot, BookingStatus, BusyInterval } from "../core/types.js";
import { type LivekitWebhookEvent } from "../video/livekit.js";
import { type AgendaServerConfig } from "./config.js";
/** Block that closes every resource of a scope. */
export declare const ALL_CALENDARS = "*";
export type GuestInput = {
    name: string;
    email: string;
    phone?: string | null;
    timezone?: string | null;
};
export type CreateBookingInput = {
    scope: string;
    eventTypeId: string;
    startUtc: string | Date;
    guest: GuestInput;
    topic?: string | null;
    answers?: Record<string, unknown>;
    source?: string | null;
    /** Passed to `onBookingCreated` untouched, never stored. */
    extra?: Record<string, unknown>;
};
export type CreateBookingResult = {
    ok: true;
    booking: AgendaBooking;
    manageToken: string;
    guestUrl: string | null;
} | {
    ok: false;
    error: "unconfigured" | "unknown_event_type" | "invalid_input" | "invalid_slot" | "slot_taken" | "db_error";
    field?: string;
};
export type CancelBookingInput = {
    id: string;
    by: "host" | "guest" | "system";
    /** Required when `by` is `guest`. */
    manageToken?: string;
    /** When set, the booking must belong to this scope. */
    scope?: string;
    reason?: string | null;
};
export type CancelBookingResult = {
    ok: true;
    booking: AgendaBooking;
} | {
    ok: false;
    error: "unconfigured" | "not_found" | "forbidden" | "not_cancellable" | "db_error";
};
export type VideoAccessInput = {
    bookingId: string;
    as: "guest";
    manageToken: string;
} | {
    bookingId: string;
    as: "host";
    identity: string;
    name: string;
    scope?: string;
};
export type VideoAccessResult = {
    ok: true;
    serverUrl: string;
    token: string;
    room: string;
    role: "guest" | "host";
    /** Name shown to the other participants. */
    displayName: string;
    booking: AgendaBooking;
} | {
    ok: false;
    error: "unconfigured" | "video_disabled" | "not_found" | "forbidden" | "not_video" | "cancelled" | "too_early" | "ended";
    /** With `too_early`: when the room opens. */
    opensAt?: string;
    booking?: AgendaBooking;
};
export type WebhookResult = {
    ok: true;
    event: LivekitWebhookEvent;
    bookingId: string | null;
} | {
    ok: false;
    error: "video_disabled" | "unauthorized" | "unconfigured";
};
export type AgendaServer = ReturnType<typeof createAgendaServer>;
export declare function createAgendaServer(config: AgendaServerConfig): {
    eventType: (scope: string, id?: string | null) => Promise<AgendaEventType | null>;
    eventTypes: (scope: string) => Promise<AgendaEventType[]>;
    /** Settings page backend: event types, hosts. */
    settings: {
        eventTypes: (scope: string) => Promise<AgendaEventType[]>;
        hosts: (scope: string) => Promise<import("../core/types.js").AgendaHost[]>;
        saveEventType(scope: string, id: string, input: Record<string, unknown>): Promise<AgendaEventType | {
            error: string;
        }>;
        resetEventType(scope: string, id: string): Promise<boolean>;
        syncHosts(scope: string, people: ReadonlyArray<{
            externalId: string;
            name: string;
            email?: string | null;
        }>): Promise<import("../core/types.js").AgendaHost[]>;
        updateHost(scope: string, id: string, patch: {
            active?: boolean;
            weekly?: unknown;
        }): Promise<import("../core/types.js").AgendaHost | null>;
    };
    /** Connected calendars (Google, Microsoft, CalDAV, ICS). */
    calendars: {
        enabled: () => boolean;
        providers(): Record<import("./index.js").CalendarProvider, boolean>;
        list(scope: string, hostId?: string): Promise<import("./index.js").CalendarConnection[]>;
        startOAuth(scope: string, hostId: string, provider: "google" | "microsoft", returnTo?: string): string;
        finishOAuth(provider: "google" | "microsoft", code: string | null, stateToken: string | null): Promise<import("./index.js").ConnectResult & {
            returnTo?: string;
        }>;
        connectCalDav(scope: string, hostId: string, input: {
            server?: string;
            username: string;
            password: string;
        }): Promise<import("./index.js").ConnectResult>;
        connectIcs(scope: string, hostId: string, input: {
            url: string;
            label?: string;
        }): Promise<import("./index.js").ConnectResult>;
        remove(scope: string, id: string): Promise<boolean>;
        busyByHost(scope: string, hostIds: readonly string[], from: Date, to: Date): Promise<Map<string, BusyInterval[]>>;
    };
    manageTokenFor: (bookingId: string) => string;
    verifyManageToken: (bookingId: string, token: string | null | undefined) => boolean;
    /** The guest link for a booking, e.g. to put it again in a reminder. Null without `guestUrl`. */
    guestUrlFor: (booking: AgendaBooking) => string | null;
    /** Name the guest appears with in the call (`guestDisplayName`, else the booking name). */
    guestDisplayName: (booking: AgendaBooking) => string;
    roomFor: (bookingId: string) => string;
    getBooking: (id: string) => Promise<AgendaBooking | null>;
    /** Dates that can be offered in a date picker. */
    listBookableDays(scope: string, eventTypeId?: string | null): Promise<string[]>;
    getAvailability(input: {
        scope: string;
        eventTypeId?: string | null;
        date: string;
    }): Promise<{
        ok: true;
        date: string;
        timezone: string;
        slots: AgendaSlot[];
    } | {
        ok: false;
        error: "unknown_event_type" | "invalid_date";
    }>;
    createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
    cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
    setStatus(id: string, status: Extract<BookingStatus, "completed" | "no_show">, scope?: string): Promise<AgendaBooking | null>;
    listBookings(input: {
        scope: string;
        from: Date | string;
        to: Date | string;
        statuses?: readonly BookingStatus[];
    }): Promise<AgendaBooking[]>;
    /**
     * Confirmed bookings starting within `leadMinutes`, marked as reminded in
     * the same UPDATE so that overlapping cron runs never remind twice.
     */
    claimDueReminders(input: {
        leadMinutes: number;
        scope?: string;
    }): Promise<AgendaBooking[]>;
    addBlock(input: {
        scope: string;
        calendar?: string;
        startsAt: Date | string;
        endsAt: Date | string;
        reason?: string | null;
    }): Promise<{
        id: string;
        scope: string;
        calendar: string;
        starts_at: string;
        ends_at: string;
        reason: string | null;
    } | null>;
    listBlocks(input: {
        scope: string;
        from: Date | string;
        to: Date | string;
    }): Promise<{
        id: string;
        scope: string;
        calendar: string;
        starts_at: string;
        ends_at: string;
        reason: string | null;
    }[]>;
    removeBlock(input: {
        scope: string;
        id: string;
    }): Promise<boolean>;
    /**
     * A LiveKit access token for a booking's room. The caller authenticates
     * hosts; guests are authenticated by their booking token.
     */
    issueVideoAccess(input: VideoAccessInput): Promise<VideoAccessResult>;
    handleLivekitWebhook(rawBody: string, authorization: string | null): Promise<WebhookResult>;
};
//# sourceMappingURL=agenda.d.ts.map