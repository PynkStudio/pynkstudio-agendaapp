import { describe, expect, it } from "vitest";

import { eventIcs, googleCalendarLink, outlookCalendarLink } from "../ics.js";

const ev = {
  uid: "b1@agendaapp",
  start: "2026-10-05T08:20:00.000Z",
  end: "2026-10-05T08:40:00.000Z",
  title: "Call, intro; 20 min",
  description: "Topic: new website\nPhone: +39 333",
  url: "https://example.com/call/b1?t=abc",
};

describe("eventIcs", () => {
  it("writes a valid, escaped, folded VEVENT", () => {
    const ics = eventIcs({ ...ev, description: `${ev.description}\n${"x".repeat(120)}` });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("DTSTART:20261005T082000Z");
    expect(ics).toContain("SUMMARY:Call\\, intro\\; 20 min");
    expect(ics).toContain("UID:b1@agendaapp");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(ics).toMatch(/\r\n [^\r\n]/); // folded continuation
    expect(eventIcs({ ...ev, status: "CANCELLED" })).toContain("METHOD:CANCEL");
  });

  it("builds Google and Outlook links", () => {
    const g = new URL(googleCalendarLink(ev));
    expect(g.searchParams.get("dates")).toBe("20261005T082000Z/20261005T084000Z");
    expect(g.searchParams.get("details")).toContain("https://example.com/call/b1?t=abc");
    const o = new URL(outlookCalendarLink(ev, "work"));
    expect(o.host).toBe("outlook.office.com");
    expect(o.searchParams.get("startdt")).toBe("2026-10-05T08:20:00.000Z");
  });
});
