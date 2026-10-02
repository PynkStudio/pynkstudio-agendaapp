/**
 * Web-standard `(Request) => Response` handlers. They work as Next.js route
 * handlers and in any fetch-based runtime. The host resolves the scope (which
 * tenant or project the request is for) and authenticates its own staff;
 * everything else is here.
 */
import type { AgendaBooking, BookingStatus } from "../core/types.js";
import type { AgendaServer } from "../server/agenda.js";
export type HostIdentity = {
    identity: string;
    name: string;
};
export type AgendaHandlersConfig = {
    agenda: AgendaServer | (() => AgendaServer);
    /** Resolves the staff member behind a request, or null when not allowed on this scope. */
    authorizeHost?: (request: Request, scope: string) => Promise<HostIdentity | null> | HostIdentity | null;
    /** Guest fields the booking form must carry besides name and email. */
    requiredFields?: ReadonlyArray<"phone" | "topic">;
    /**
     * The app's staff for a scope. When given, the settings endpoint mirrors it
     * into the package's hosts each time it is read.
     */
    listStaff?: (scope: string) => Promise<ReadonlyArray<{
        externalId: string;
        name: string;
        email?: string | null;
    }>>;
    /**
     * Return the guest link in the booking response (from the server's
     * `guestUrl`). Off by default: the link is a credential, and email is the
     * safer channel for it.
     */
    exposeGuestUrl?: boolean;
};
type Ctx = {
    scope: string;
};
/** Booking fields safe to show to staff. */
export declare function serializeBooking(b: AgendaBooking): {
    id: string;
    eventType: string;
    hostId: string | null;
    status: BookingStatus;
    startsAt: string;
    endsAt: string;
    location: import("../core/types.js").LocationKind;
    name: string;
    email: string;
    phone: string | null;
    topic: string | null;
    guestTimezone: string | null;
    answers: Record<string, unknown>;
    source: string | null;
    videoStartedAt: string | null;
    videoEndedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    createdAt: string;
};
export declare function createAgendaHandlers(config: AgendaHandlersConfig): {
    /**
     * `GET ?event=ID` → `{ days }`, the bookable dates.
     * `GET ?event=ID&date=YYYY-MM-DD` → `{ date, timezone, slots }`. No personal data.
     */
    availability(request: Request, { scope }: Ctx): Promise<Response>;
    /** `POST` a booking. 409 when the slot was taken meanwhile. */
    book(request: Request, { scope }: Ctx): Promise<Response>;
    /**
     * `POST { bookingId, token }` as a guest, or `POST { bookingId }` as
     * authenticated staff → `{ serverUrl, token, room, role }`.
     */
    videoToken(request: Request, { scope }: Ctx): Promise<Response>;
    /** `POST { bookingId, token, reason? }` — the guest cancels their own booking. */
    guestCancel(request: Request, { scope }: Ctx): Promise<Response>;
    /** Staff: `GET ?from&to` lists bookings. */
    hostList(request: Request, { scope }: Ctx): Promise<Response>;
    /** Staff: `PATCH { id, action: "cancel" | "complete" | "no_show", reason? }`. */
    hostUpdate(request: Request, { scope }: Ctx): Promise<Response>;
    /**
     * Staff — settings page data: `GET` → `{ eventTypes, hosts, connections, providers, holidayCalendars }`.
     */
    settingsGet(request: Request, { scope }: Ctx): Promise<Response>;
    /**
     * Staff — `PUT { id, ...fields }` saves an event type's settings;
     * `PUT { id, reset: true }` goes back to the code default.
     */
    settingsSaveEventType(request: Request, { scope }: Ctx): Promise<Response>;
    /** Staff — `PATCH { hostId, active?, weekly? }` (weekly `null` = same hours as the event type). */
    settingsUpdateHost(request: Request, { scope }: Ctx): Promise<Response>;
    /**
     * Staff — `POST { hostId, provider: "caldav", username, password, server? }`
     * or `{ hostId, provider: "ics", url, label? }` connects a calendar;
     * `DELETE { id }` disconnects one.
     */
    calendarsManage(request: Request, { scope }: Ctx): Promise<Response>;
    /** Staff — `GET ?hostId&provider=google|microsoft&returnTo` → redirect to the provider's consent screen. */
    calendarOAuthStart(request: Request, { scope }: Ctx): Promise<Response>;
    /** OAuth callback for a provider: stores the connection, then redirects to `returnTo?calendar=connected|error`. */
    calendarOAuthCallback(request: Request, provider: "google" | "microsoft"): Promise<Response>;
    /** LiveKit webhook receiver. Needs the raw body, so mount it on its own route. */
    livekitWebhook(request: Request): Promise<Response>;
};
export type AgendaHandlers = ReturnType<typeof createAgendaHandlers>;
export {};
//# sourceMappingURL=handlers.d.ts.map