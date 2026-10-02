import type { AgendaBooking, BookingStatus, LocationKind } from "../core/types.js";
export declare const BOOKING_COLUMNS = "id, scope, event_type, calendar, host_id, status, starts_at, ends_at, location, name, email, phone, topic, guest_timezone, answers, source, video_room, video_started_at, video_ended_at, reminder_sent_at, cancelled_at, cancel_reason, created_at";
export type BookingRow = {
    id: string;
    scope: string;
    event_type: string;
    calendar: string;
    host_id?: string | null;
    status: BookingStatus;
    starts_at: string;
    ends_at: string;
    location: LocationKind;
    name: string;
    email: string;
    phone: string | null;
    topic: string | null;
    guest_timezone: string | null;
    answers: Record<string, unknown> | null;
    source: string | null;
    video_room: string | null;
    video_started_at: string | null;
    video_ended_at: string | null;
    reminder_sent_at: string | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    created_at: string;
};
export declare function toBooking(row: BookingRow): AgendaBooking;
//# sourceMappingURL=rows.d.ts.map