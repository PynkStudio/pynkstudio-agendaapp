import type { AgendaBooking, AgendaEventType } from "../core/types.js";
import type { LivekitCredentials, LivekitWebhookEvent } from "../video/livekit.js";
/**
 * Structural type of the Supabase client the package needs. The host passes a
 * service-role client; the package never depends on `@supabase/supabase-js`.
 */
export type AgendaDb = {
    from: (table: string) => any;
};
export type AgendaTables = {
    bookings: string;
    blocks: string;
    videoEvents: string;
};
export declare const DEFAULT_TABLES: AgendaTables;
export type AgendaVideoConfig = LivekitCredentials & {
    /** Guests may enter this many minutes before the start. Default 10. */
    joinEarlyMinutes?: number;
    /** The room stays joinable this many minutes after the scheduled end. Default 30. */
    joinLateMinutes?: number;
    /** Lifetime of an access token. Default 2 hours. */
    tokenTtlSeconds?: number;
    /** Room name prefix; the booking id follows. Default `agenda-`. */
    roomPrefix?: string;
};
export type BookingCreatedContext = {
    booking: AgendaBooking;
    eventType: AgendaEventType;
    /** Secret that lets the guest join the call and manage the booking. */
    manageToken: string;
    /**
     * The guest's personal link built with `guestUrl`, or null when the host did
     * not configure it. Put it in the confirmation email: it is the only way the
     * guest reaches the video room.
     */
    guestUrl: string | null;
    /** Fields the booking request carried beyond the standard ones (CRM, attribution…). */
    extra: Record<string, unknown>;
};
export type BookingCancelledContext = {
    booking: AgendaBooking;
    by: "host" | "guest" | "system";
};
export type VideoEventContext = {
    booking: AgendaBooking | null;
    event: LivekitWebhookEvent;
};
export type AgendaHooks = {
    onBookingCreated?: (ctx: BookingCreatedContext) => Promise<void> | void;
    onBookingCancelled?: (ctx: BookingCancelledContext) => Promise<void> | void;
    onVideoEvent?: (ctx: VideoEventContext) => Promise<void> | void;
};
export type AgendaLogger = {
    warn: (message: string, error?: unknown) => void;
};
export type AgendaServerConfig = {
    /** Service-role client, or null when the host is not configured (every call then fails soft). */
    db: () => AgendaDb | null;
    /** Event types offered by a scope. Same list for every scope when an array is given. */
    eventTypes: readonly AgendaEventType[] | ((scope: string) => readonly AgendaEventType[]);
    /**
     * Secret used to derive per-booking guest tokens. Tokens are derived, not
     * stored, so a reminder sent days later can rebuild the same join link.
     */
    signingSecret: string;
    video?: AgendaVideoConfig | null;
    /**
     * Builds the guest's personal page URL, where they join the call (and, if
     * the host wants, cancel). The page must pass `bookingId` and `token` to the
     * `videoToken` handler. Example: `(b, t) => \`https://example.com/call/${b.id}?t=${t}\``.
     */
    guestUrl?: (booking: AgendaBooking, manageToken: string) => string;
    tables?: Partial<AgendaTables>;
    hooks?: AgendaHooks;
    logger?: AgendaLogger;
    /** Injectable clock, for tests. */
    now?: () => Date;
};
//# sourceMappingURL=config.d.ts.map