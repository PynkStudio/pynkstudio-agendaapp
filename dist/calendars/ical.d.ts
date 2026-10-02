import type { BusyInterval } from "../core/types.js";
/**
 * Busy intervals of an iCalendar document within [from, to): expands
 * recurrences (with their exceptions), skips cancelled and transparent
 * ("show as free") events.
 */
export declare function busyFromIcs(text: string, from: Date, to: Date): BusyInterval[];
//# sourceMappingURL=ical.d.ts.map