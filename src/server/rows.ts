import type { AgendaBooking, BookingStatus, LocationKind } from "../core/types.js";

export const BOOKING_COLUMNS =
  "id, scope, event_type, calendar, host_id, external_event, status, starts_at, ends_at, location, name, email, phone, topic, guest_timezone, answers, source, video_room, video_started_at, video_ended_at, reminder_sent_at, cancelled_at, cancel_reason, created_at";

export type BookingRow = {
  id: string;
  scope: string;
  event_type: string;
  calendar: string;
  host_id?: string | null;
  external_event?: Record<string, string> | null;
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

export function toBooking(row: BookingRow): AgendaBooking {
  return {
    id: row.id,
    scope: row.scope,
    eventType: row.event_type,
    calendar: row.calendar,
    hostId: row.host_id ?? null,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    name: row.name,
    email: row.email,
    phone: row.phone,
    topic: row.topic,
    guestTimezone: row.guest_timezone,
    answers: row.answers ?? {},
    source: row.source,
    videoRoom: row.video_room,
    videoStartedAt: row.video_started_at,
    videoEndedAt: row.video_ended_at,
    reminderSentAt: row.reminder_sent_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
  };
}
