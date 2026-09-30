/**
 * Wall-clock ↔ instant conversion for an arbitrary IANA time zone, with no
 * dependency beyond `Intl`. Bookings are stored as UTC instants; availability
 * is declared in the calendar owner's local time, so every conversion goes
 * through here and DST transitions are handled in one place.
 */
export type ZonedParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    /** 0 = Sunday … 6 = Saturday. */
    weekday: number;
};
export declare function zonedParts(timeZone: string, at: Date): ZonedParts;
/** Offset of `timeZone` from UTC at instant `at`, in minutes (Rome in summer = 120). */
export declare function zonedOffsetMinutes(timeZone: string, at: Date): number;
export declare function isDateISO(value: string): boolean;
/**
 * Instant at which the wall clock in `timeZone` reads `dateISO hour:minute`.
 * Iterates so that the offset settles on DST-transition days. A wall-clock time
 * skipped by a spring-forward jump resolves to the instant just after the gap.
 */
export declare function zonedWallClockToUtc(timeZone: string, dateISO: string, hour: number, minute: number): Date;
/** `YYYY-MM-DD` of instant `at` as seen in `timeZone`. */
export declare function zonedDateISO(timeZone: string, at: Date): string;
/** `HH:MM` of instant `at` as seen in `timeZone`. */
export declare function zonedTime(timeZone: string, at: Date): string;
/** Weekday (0 = Sunday) of a calendar date. Independent of time zone. */
export declare function weekdayOfDate(dateISO: string): number;
/** Calendar parts of a `YYYY-MM-DD` date, for building day labels in any locale. */
export declare function dateParts(dateISO: string): {
    year: number;
    month: number;
    day: number;
    weekday: number;
};
export declare function addDaysISO(dateISO: string, days: number): string;
/** Parses `HH:MM` into minutes after midnight; `24:00` is allowed as end of day. */
export declare function parseClock(value: string): number;
export declare function formatClock(minutes: number): string;
export declare function isValidTimeZone(timeZone: string): boolean;
//# sourceMappingURL=time.d.ts.map