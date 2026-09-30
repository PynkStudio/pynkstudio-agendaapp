/**
 * Wall-clock ↔ instant conversion for an arbitrary IANA time zone, with no
 * dependency beyond `Intl`. Bookings are stored as UTC instants; availability
 * is declared in the calendar owner's local time, so every conversion goes
 * through here and DST transitions are handled in one place.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

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

export function zonedParts(timeZone: string, at: Date): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(timeZone).formatToParts(at)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    // Some engines still print midnight as "24" even with h23.
    hour: out.hour === "24" ? 0 : Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS.indexOf(out.weekday),
  };
}

/** Offset of `timeZone` from UTC at instant `at`, in minutes (Rome in summer = 120). */
export function zonedOffsetMinutes(timeZone: string, at: Date): number {
  const p = zonedParts(timeZone, at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isDateISO(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Instant at which the wall clock in `timeZone` reads `dateISO hour:minute`.
 * Iterates so that the offset settles on DST-transition days. A wall-clock time
 * skipped by a spring-forward jump resolves to the instant just after the gap.
 */
export function zonedWallClockToUtc(timeZone: string, dateISO: string, hour: number, minute: number): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, hour, minute, 0);
  let guess = naive;
  for (let i = 0; i < 3; i++) {
    const corrected = naive - zonedOffsetMinutes(timeZone, new Date(guess)) * 60000;
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess);
}

/** `YYYY-MM-DD` of instant `at` as seen in `timeZone`. */
export function zonedDateISO(timeZone: string, at: Date): string {
  const p = zonedParts(timeZone, at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `HH:MM` of instant `at` as seen in `timeZone`. */
export function zonedTime(timeZone: string, at: Date): string {
  const p = zonedParts(timeZone, at);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Weekday (0 = Sunday) of a calendar date. Independent of time zone. */
export function weekdayOfDate(dateISO: string): number {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay();
}

/** Calendar parts of a `YYYY-MM-DD` date, for building day labels in any locale. */
export function dateParts(dateISO: string): { year: number; month: number; day: number; weekday: number } {
  const [year, month, day] = dateISO.split("-").map(Number);
  return { year, month: month - 1, day, weekday: weekdayOfDate(dateISO) };
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Parses `HH:MM` into minutes after midnight; `24:00` is allowed as end of day. */
export function parseClock(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid clock time "${value}", expected HH:MM`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (Number(match[2]) > 59 || minutes > 24 * 60) throw new Error(`Invalid clock time "${value}"`);
  return minutes;
}

export function formatClock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
