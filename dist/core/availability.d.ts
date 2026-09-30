import type { AgendaEventType, AgendaSlot, BusyInterval } from "./types.js";
export declare const DEFAULT_LOOKAHEAD_DAYS = 14;
export declare const DEFAULT_CALENDAR = "default";
/** Throws on a malformed event type, so a bad host config fails at startup, not at booking time. */
export declare function assertValidEventType(eventType: AgendaEventType): void;
export declare function calendarOf(eventType: AgendaEventType): string;
type Candidate = {
    time: string;
    start: Date;
    end: Date;
};
/** Every slot the weekly windows allow on a date, ignoring bookings and the clock. */
export declare function candidateSlots(eventType: AgendaEventType, dateISO: string): Candidate[];
/** The next `lookaheadDays` dates (in the event's zone, starting today) that have at least one window. */
export declare function bookableDays(eventType: AgendaEventType, now?: Date): string[];
/**
 * Mirrors the database exclusion constraint: a booking occupies
 * `[start, end + buffer)`, and busy intervals already carry their own buffer
 * in `end` (the stored `blocked_until`).
 */
export declare function overlapsBusy(start: Date, end: Date, busy: readonly BusyInterval[], bufferMinutes?: number): boolean;
/** Slots of a date with their availability. Empty when the date is outside the bookable range. */
export declare function slotsForDate(eventType: AgendaEventType, dateISO: string, busy?: readonly BusyInterval[], now?: Date): AgendaSlot[];
/**
 * Server-side check that `start` is exactly one of the offered slots and still
 * open. Never trust a start time sent by a client. Collisions with other
 * bookings are enforced by the database, not here.
 */
export declare function isBookableStart(eventType: AgendaEventType, start: Date, now?: Date): boolean;
export declare function slotEnd(eventType: AgendaEventType, start: Date): Date;
/** Human label of a slot, e.g. `lunedì 16 giugno, 10:20`. */
export declare function formatSlotLabel(start: Date | string, options: {
    timezone: string;
    locale?: string;
}): string;
export {};
//# sourceMappingURL=availability.d.ts.map