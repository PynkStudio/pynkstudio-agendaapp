import { describe, expect, it } from "vitest";

import { encryptJson } from "../../calendars/crypto.js";
import { googleCreateEvent, googleDeleteEvent } from "../../calendars/google.js";
import { microsoftCreateEvent } from "../../calendars/microsoft.js";
import type { AgendaEventType } from "../../core/types.js";
import { createAgendaHandlers } from "../../http/handlers.js";
import { createAgendaServer } from "../agenda.js";
import { createFakeDb } from "./fake-db.js";

const KEY = "k".repeat(40);
const et: AgendaEventType = {
  id: "intro",
  title: "Intro",
  durationMinutes: 30,
  timezone: "Europe/Rome",
  weekly: [{ day: 1, start: "09:00", end: "12:00" }],
  location: "video",
};

describe("writing bookings into the host calendar", () => {
  it("puts the event in the chosen CalDAV calendar and removes it on cancel", async () => {
    const calls: Array<{ method: string; url: string; body?: string }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url, body: init.body ? String(init.body) : undefined });
      if (init.method === "REPORT") return new Response("<d:multistatus xmlns:d=\"DAV:\"/>", { status: 207 });
      return new Response(null, { status: init.method === "PUT" ? 201 : 204 });
    }) as unknown as typeof fetch;
    const db = createFakeDb();
    const agenda = createAgendaServer({
      db: () => db,
      eventTypes: [et],
      signingSecret: "a-very-long-signing-secret",
      now: () => new Date("2026-10-05T05:00:00Z"),
      logger: { warn: () => {} },
      calendars: { credentialsKey: KEY, redirectUri: () => "https://x/cb", fetch: fake },
      hostCalendarEvent: (b) => ({ title: `Call con ${b.name}` }),
    });
    const [anna] = await agenda.settings.syncHosts("s", [{ externalId: "u1", name: "Anna" }]);
    await agenda.settings.saveEventType("s", "intro", { staffing: { mode: "hosts", hostIds: [anna.id] } });
    const calUrl = "https://caldav.example.test/1/calendars/work/";
    db.tables.agenda_calendar_connections = [
      {
        id: "c1",
        scope: "s",
        host_id: anna.id,
        provider: "caldav",
        account: "anna@icloud.com",
        credentials: encryptJson(KEY, { server: "https://caldav.example.test", username: "a", password: "p", calendars: [calUrl] }),
        status: "ok",
      },
    ];
    await agenda.settings.updateHost("s", anna.id, { writeTarget: { connectionId: "c1", calendarId: calUrl, calendarName: "Lavoro" } });

    const r = await agenda.createBooking({
      scope: "s",
      eventTypeId: "intro",
      startUtc: "2026-10-05T07:00:00.000Z",
      guest: { name: "Mario Rossi", email: "mario@example.com" },
    });
    if (!r.ok) throw new Error(r.error);
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe(`${calUrl}${encodeURIComponent(`${r.booking.id}@agendaapp`)}.ics`);
    expect(put?.body).toContain("SUMMARY:Call con Mario Rossi");
    expect(put?.body).not.toContain("METHOD:");
    const stored = db.tables.agenda_bookings.find((b) => b.id === r.booking.id);
    expect(stored?.external_event).toMatchObject({ connectionId: "c1", provider: "caldav", eventId: put?.url });

    await agenda.cancelBooking({ id: r.booking.id, by: "host" });
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe(put?.url);
    expect(db.tables.agenda_bookings.find((b) => b.id === r.booking.id)?.external_event).toBeNull();
  });

  it("serves the guest .ics only with the booking token", async () => {
    const db = createFakeDb();
    const agenda = createAgendaServer({
      db: () => db,
      eventTypes: [et],
      signingSecret: "a-very-long-signing-secret",
      now: () => new Date("2026-10-05T05:00:00Z"),
      logger: { warn: () => {} },
      guestUrl: (b, t) => `https://example.test/call/${b.id}?t=${t}`,
    });
    const r = await agenda.createBooking({ scope: "s", eventTypeId: "intro", startUtc: "2026-10-05T07:00:00.000Z", guest: { name: "M", email: "m@example.com" } });
    if (!r.ok) throw new Error(r.error);
    const h = createAgendaHandlers({ agenda });
    const ok = await h.guestIcs(new Request(`https://x/ics?bookingId=${r.booking.id}&token=${r.manageToken}`), { scope: "s" });
    expect(ok.headers.get("content-type")).toContain("text/calendar");
    const text = await ok.text();
    expect(text).toContain("DTSTART:20261005T070000Z");
    expect(text).toContain("https://example.test/call/");
    const bad = await h.guestIcs(new Request(`https://x/ics?bookingId=${r.booking.id}&token=nope`), { scope: "s" });
    expect(bad.status).toBe(403);
  });
});

describe("provider writes", () => {
  const event = { uid: "u@x", title: "T", start: new Date("2026-10-05T07:00:00Z"), end: new Date("2026-10-05T07:30:00Z") };

  it("creates and deletes a Google event", async () => {
    const seen: Array<[string, RequestInit]> = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push([url, init]);
      return init.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ id: "g1" });
    }) as unknown as typeof fetch;
    expect(await googleCreateEvent("tok", "team@group.calendar.google.com", event, fake)).toBe("g1");
    expect(seen[0][0]).toContain("/calendars/team%40group.calendar.google.com/events");
    expect(JSON.parse(String(seen[0][1].body))).toMatchObject({ summary: "T", iCalUID: "u@x" });
    await googleDeleteEvent("tok", "primary", "g1", fake);
    expect(seen[1][1].method).toBe("DELETE");
  });

  it("creates a Microsoft event in UTC", async () => {
    let body: Record<string, unknown> = {};
    const fake = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({ id: "m1" });
    }) as unknown as typeof fetch;
    expect(await microsoftCreateEvent("tok", "cal1", event, fake)).toBe("m1");
    expect(body.start).toEqual({ dateTime: "2026-10-05T07:00:00.000", timeZone: "UTC" });
  });
});
