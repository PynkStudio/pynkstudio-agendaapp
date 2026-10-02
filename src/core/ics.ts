/**
 * "Save to calendar" for guests: an iCalendar file plus Google and Outlook
 * links. Pure functions, browser-safe.
 */

export type CalendarEventInput = {
  /** Stable id: the same booking must always produce the same UID. */
  uid: string;
  start: Date | string;
  end: Date | string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  /** Shown as organizer in calendar apps. */
  organizer?: { name: string; email: string };
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 text escaping. */
function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines at 75 octets as RFC 5545 requires (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

/**
 * A single-event iCalendar document (`METHOD:PUBLISH`): opening it adds the
 * event to Apple Calendar, Outlook, Google and most other apps.
 * `status: "CANCELLED"` with the same uid removes it in apps that honour it.
 */
export function eventIcs(input: CalendarEventInput & { status?: "CONFIRMED" | "CANCELLED"; sequence?: number; productId?: string }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${input.productId ?? "-//agendaapp//EN"}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${input.status === "CANCELLED" ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${esc(input.uid)}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(toDate(input.start))}`,
    `DTEND:${utcStamp(toDate(input.end))}`,
    `SUMMARY:${esc(input.title)}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    `STATUS:${input.status ?? "CONFIRMED"}`,
  ];
  const description = [input.description, input.url].filter(Boolean).join("\n\n");
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (input.location ?? input.url) lines.push(`LOCATION:${esc(input.location ?? input.url ?? "")}`);
  if (input.url) lines.push(`URL:${input.url}`);
  if (input.organizer) lines.push(`ORGANIZER;CN=${esc(input.organizer.name)}:mailto:${input.organizer.email}`);
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(input.title)}`,
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "Add to Google Calendar" link (opens the event form prefilled). */
export function googleCalendarLink(input: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${utcStamp(toDate(input.start))}/${utcStamp(toDate(input.end))}`,
  });
  const details = [input.description, input.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  if (input.location ?? input.url) params.set("location", input.location ?? input.url ?? "");
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * "Add to Outlook" link. `account: "personal"` targets outlook.live.com
 * (Hotmail, Outlook.com), `"work"` targets Microsoft 365 (outlook.office.com).
 */
export function outlookCalendarLink(input: CalendarEventInput, account: "personal" | "work" = "personal"): string {
  const host = account === "work" ? "https://outlook.office.com" : "https://outlook.live.com";
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: input.title,
    startdt: toDate(input.start).toISOString(),
    enddt: toDate(input.end).toISOString(),
  });
  const body = [input.description, input.url].filter(Boolean).join("\n\n");
  if (body) params.set("body", body);
  if (input.location ?? input.url) params.set("location", input.location ?? input.url ?? "");
  return `${host}/calendar/0/deeplink/compose?${params}`;
}
