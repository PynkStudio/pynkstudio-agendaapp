import type { AgendaSlot, LocationKind } from "../core/types.js";
export type AgendaBookingOptions = {
    /** Endpoint mounted with the `availability` handler. */
    availabilityUrl: string;
    /** Endpoint mounted with the `book` handler. */
    bookingUrl: string;
    /** Event type id. The scope's first event type when omitted. */
    eventType?: string;
};
export type AgendaEventTypeSummary = {
    id: string;
    title: string;
    durationMinutes: number;
    location: LocationKind;
};
export type AgendaBookingFields = {
    name: string;
    email: string;
    phone?: string;
    topic?: string;
    source?: string;
    answers?: Record<string, unknown>;
    /** Anything else is forwarded to the host's `onBookingCreated` hook. */
    [extra: string]: unknown;
};
export type AgendaBookingSubmitResult = {
    ok: true;
    id: string;
    startsAt: string;
    endsAt: string;
    location: LocationKind;
    guestUrl?: string;
} | {
    ok: false;
    error: string;
    field?: string;
};
/**
 * Headless state machine for the "pick a day → pick a time → leave your
 * details" flow. It owns data and transitions; the host owns every pixel.
 */
export declare function useAgendaBooking(options: AgendaBookingOptions): {
    status: "error" | "loading" | "ready";
    eventType: AgendaEventTypeSummary | null;
    timezone: string | null;
    days: string[];
    selectedDate: string | null;
    selectDate: (date: string | null) => void;
    slots: AgendaSlot[] | null;
    loadingSlots: boolean;
    selectedSlot: AgendaSlot | null;
    selectSlot: (slot: AgendaSlot | null) => void;
    reloadSlots: () => void;
    submit: (fields: AgendaBookingFields) => Promise<AgendaBookingSubmitResult>;
    submitting: boolean;
};
export type AgendaBookingState = ReturnType<typeof useAgendaBooking>;
//# sourceMappingURL=use-agenda-booking.d.ts.map