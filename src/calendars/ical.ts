import ICAL from "ical.js";

import type { BusyInterval } from "../core/types.js";

const MAX_OCCURRENCES = 2000;

/**
 * Busy intervals of an iCalendar document within [from, to): expands
 * recurrences (with their exceptions), skips cancelled and transparent
 * ("show as free") events.
 */
export function busyFromIcs(text: string, from: Date, to: Date): BusyInterval[] {
  const root = new ICAL.Component(ICAL.parse(text));
  const calendars = root.name === "vcalendar" ? [root] : root.getAllSubcomponents("vcalendar");
  const out: BusyInterval[] = [];

  for (const cal of calendars) {
    for (const tz of cal.getAllSubcomponents("vtimezone")) {
      try {
        ICAL.TimezoneService.register(tz);
      } catch {
        // A malformed VTIMEZONE falls back to floating time for its events.
      }
    }
    const vevents = cal.getAllSubcomponents("vevent");
    const exceptions = vevents.filter((v) => v.hasProperty("recurrence-id"));
    for (const v of vevents) {
      if (v.hasProperty("recurrence-id")) continue;
      const event = new ICAL.Event(v, {
        exceptions: exceptions.filter((x) => x.getFirstPropertyValue("uid") === v.getFirstPropertyValue("uid")),
      });
      const free = (e: ICAL.Event) =>
        String(e.component.getFirstPropertyValue("transp") ?? "").toUpperCase() === "TRANSPARENT" ||
        String(e.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

      if (!event.isRecurring()) {
        if (free(event) || !event.startDate) continue;
        const start = event.startDate.toJSDate();
        const end = (event.endDate ?? event.startDate).toJSDate();
        if (start < to && end > from) out.push({ start, end: end > start ? end : new Date(start.getTime() + 1) });
        continue;
      }

      const it = event.iterator();
      for (let i = 0; i < MAX_OCCURRENCES; i++) {
        const next = it.next();
        if (!next) break;
        const details = event.getOccurrenceDetails(next);
        const start = details.startDate.toJSDate();
        if (start >= to) break;
        const end = details.endDate.toJSDate();
        if (end <= from || free(details.item)) continue;
        out.push({ start, end });
      }
    }
  }
  return out;
}
