export const BOOKING_COLUMNS = "id, scope, event_type, calendar, status, starts_at, ends_at, location, name, email, phone, topic, guest_timezone, answers, source, video_room, video_started_at, video_ended_at, reminder_sent_at, cancelled_at, cancel_reason, created_at";
export function toBooking(row) {
    return {
        id: row.id,
        scope: row.scope,
        eventType: row.event_type,
        calendar: row.calendar,
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
//# sourceMappingURL=rows.js.map