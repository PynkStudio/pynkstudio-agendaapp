import { addDaysISO, formatClock, isDateISO, isValidTimeZone, parseClock, weekdayOfDate, zonedDateISO, zonedWallClockToUtc, } from "./time.js";
export const DEFAULT_LOOKAHEAD_DAYS = 14;
export const DEFAULT_CALENDAR = "default";
/** Throws on a malformed event type, so a bad host config fails at startup, not at booking time. */
export function assertValidEventType(eventType) {
    const where = `event type "${eventType.id}"`;
    if (!eventType.id)
        throw new Error("Event type without id");
    if (!isValidTimeZone(eventType.timezone))
        throw new Error(`${where}: unknown time zone ${eventType.timezone}`);
    if (!(eventType.durationMinutes > 0))
        throw new Error(`${where}: durationMinutes must be positive`);
    if (eventType.slotStepMinutes !== undefined && !(eventType.slotStepMinutes > 0)) {
        throw new Error(`${where}: slotStepMinutes must be positive`);
    }
    for (const w of eventType.weekly) {
        if (parseClock(w.end) <= parseClock(w.start))
            throw new Error(`${where}: window ${w.start}-${w.end} is empty`);
    }
    for (const d of eventType.closedDates ?? []) {
        if (!isDateISO(d))
            throw new Error(`${where}: closed date "${d}" is not YYYY-MM-DD`);
    }
}
export function calendarOf(eventType) {
    return eventType.calendar || DEFAULT_CALENDAR;
}
/** Every slot the weekly windows allow on a date, ignoring bookings and the clock. */
export function candidateSlots(eventType, dateISO) {
    if (!isDateISO(dateISO))
        return [];
    if (eventType.closedDates?.includes(dateISO))
        return [];
    const weekday = weekdayOfDate(dateISO);
    const step = eventType.slotStepMinutes ?? eventType.durationMinutes;
    const seen = new Set();
    const out = [];
    for (const w of eventType.weekly) {
        if (w.day !== weekday)
            continue;
        const open = parseClock(w.start);
        const close = parseClock(w.end);
        for (let m = open; m + eventType.durationMinutes <= close; m += step) {
            const start = zonedWallClockToUtc(eventType.timezone, dateISO, Math.floor(m / 60), m % 60);
            if (seen.has(start.getTime()))
                continue;
            seen.add(start.getTime());
            out.push({
                time: formatClock(m),
                start,
                end: new Date(start.getTime() + eventType.durationMinutes * 60000),
            });
        }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
/** The next `lookaheadDays` dates (in the event's zone, starting today) that have at least one window. */
export function bookableDays(eventType, now = new Date()) {
    const wanted = eventType.lookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
    const days = [];
    let cursor = zonedDateISO(eventType.timezone, now);
    for (let i = 0; i < wanted * 7 + 7 && days.length < wanted; i++) {
        if (candidateSlots(eventType, cursor).length > 0)
            days.push(cursor);
        cursor = addDaysISO(cursor, 1);
    }
    return days;
}
/**
 * Mirrors the database exclusion constraint: a booking occupies
 * `[start, end + buffer)`, and busy intervals already carry their own buffer
 * in `end` (the stored `blocked_until`).
 */
export function overlapsBusy(start, end, busy, bufferMinutes = 0) {
    const blockedUntil = end.getTime() + bufferMinutes * 60000;
    return busy.some((b) => start.getTime() < b.end.getTime() && b.start.getTime() < blockedUntil);
}
function isOpenForBooking(eventType, start, now) {
    const notice = (eventType.minNoticeMinutes ?? 0) * 60000;
    return start.getTime() > now.getTime() + notice;
}
/** Slots of a date with their availability. Empty when the date is outside the bookable range. */
export function slotsForDate(eventType, dateISO, busy = [], now = new Date()) {
    if (!bookableDays(eventType, now).includes(dateISO))
        return [];
    return candidateSlots(eventType, dateISO).map((c) => ({
        time: c.time,
        startUtc: c.start.toISOString(),
        endUtc: c.end.toISOString(),
        available: isOpenForBooking(eventType, c.start, now) && !overlapsBusy(c.start, c.end, busy, eventType.bufferMinutes),
    }));
}
/**
 * Server-side check that `start` is exactly one of the offered slots and still
 * open. Never trust a start time sent by a client. Collisions with other
 * bookings are enforced by the database, not here.
 */
export function isBookableStart(eventType, start, now = new Date()) {
    if (Number.isNaN(start.getTime()))
        return false;
    if (!isOpenForBooking(eventType, start, now))
        return false;
    const dateISO = zonedDateISO(eventType.timezone, start);
    if (!bookableDays(eventType, now).includes(dateISO))
        return false;
    return candidateSlots(eventType, dateISO).some((c) => c.start.getTime() === start.getTime());
}
export function slotEnd(eventType, start) {
    return new Date(start.getTime() + eventType.durationMinutes * 60000);
}
/** Human label of a slot, e.g. `lunedì 16 giugno, 10:20`. */
export function formatSlotLabel(start, options) {
    return new Intl.DateTimeFormat(options.locale ?? "it-IT", {
        timeZone: options.timezone,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
    }).format(typeof start === "string" ? new Date(start) : start);
}
//# sourceMappingURL=availability.js.map