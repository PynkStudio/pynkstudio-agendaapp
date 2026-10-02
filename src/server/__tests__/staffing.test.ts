import { describe, expect, it } from "vitest";

import { encryptJson } from "../../calendars/crypto.js";
import type { AgendaEventType } from "../../core/types.js";
import { createAgendaServer } from "../agenda.js";
import { createFakeDb } from "./fake-db.js";

const KEY = "k".repeat(40);
const guest = (n: number) => ({ name: `Guest ${n}`, email: `g${n}@example.com` });
const NOW = "2026-10-05T05:00:00Z"; // Monday 07:00 in Rome

const base: AgendaEventType = {
  id: "intro",
  title: "Intro",
  durationMinutes: 60,
  timezone: "Europe/Rome",
  weekly: [
    { day: 1, start: "09:00", end: "10:00", capacity: 2 },
    { day: 1, start: "10:00", end: "12:00" },
  ],
  location: "video",
};

function setup(et: AgendaEventType, fetchImpl?: typeof fetch) {
  const db = createFakeDb();
  const agenda = createAgendaServer({
    db: () => db,
    eventTypes: [et],
    signingSecret: "a-very-long-signing-secret",
    now: () => new Date(NOW),
    logger: { warn: () => {} },
    calendars: { credentialsKey: KEY, redirectUri: () => "https://example.test/cb", fetch: fetchImpl },
  });
  return { db, agenda };
}

const at = (time: string) => new Date(`2026-10-05T${time}:00+02:00`).toISOString();

describe("seats", () => {
  it("offers as many places as the window capacity", async () => {
    const { agenda } = setup(base);
    const day = await agenda.getAvailability({ scope: "s", date: "2026-10-05" });
    if (!day.ok) throw new Error();
    const nine = day.slots.find((s) => s.time === "09:00");
    const ten = day.slots.find((s) => s.time === "10:00");
    expect(nine?.remaining).toBe(2);
    expect(ten?.remaining).toBe(1);

    const input = { scope: "s", eventTypeId: "intro", startUtc: at("09:00") };
    const a = await agenda.createBooking({ ...input, guest: guest(1) });
    const b = await agenda.createBooking({ ...input, guest: guest(2) });
    const c = await agenda.createBooking({ ...input, guest: guest(3) });
    expect(a.ok && b.ok).toBe(true);
    expect(c).toEqual({ ok: false, error: "slot_taken" });
    if (a.ok && b.ok) expect(new Set([a.booking.calendar, b.booking.calendar])).toEqual(new Set(["default", "default#2"]));

    const after = await agenda.getAvailability({ scope: "s", date: "2026-10-05" });
    expect(after.ok && after.slots.find((s) => s.time === "09:00")?.available).toBe(false);
  });

  it("uses saved settings over the code default", async () => {
    const { agenda } = setup(base);
    const saved = await agenda.settings.saveEventType("s", "intro", {
      weekly: [{ day: 1, start: "14:00", end: "16:00", capacity: 3 }],
      holidays: ["IT", "NOPE"],
    });
    expect("error" in saved).toBe(false);
    const day = await agenda.getAvailability({ scope: "s", date: "2026-10-05" });
    expect(day.ok && day.slots.map((s) => [s.time, s.remaining])).toEqual([
      ["14:00", 3],
      ["15:00", 3],
    ]);
    const et = await agenda.eventType("s", "intro");
    expect(et?.holidays).toEqual(["IT"]);
    expect("error" in (await agenda.settings.saveEventType("s", "intro", { weekly: [{ day: 1, start: "10:00", end: "11:00", capacity: 99 }] }))).toBe(false);
  });
});

describe("hosts", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:1",
    "DTSTART:20260928T080000Z",
    "DTEND:20260928T090000Z",
    "RRULE:FREQ=WEEKLY;BYDAY=MO",
    "SUMMARY:Standup",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const fetchIcs = (async () => new Response(ics, { status: 200 })) as unknown as typeof fetch;

  it("counts free hosts, honours their calendars and assigns the booking to one", async () => {
    const { db, agenda } = setup(base, fetchIcs);
    const hosts = await agenda.settings.syncHosts("s", [
      { externalId: "u1", name: "Anna Bianchi" },
      { externalId: "u2", name: "Luca Verdi" },
    ]);
    const [anna, luca] = hosts;
    await agenda.settings.saveEventType("s", "intro", {
      staffing: { mode: "hosts", hostIds: [anna.id, luca.id] },
      weekly: [{ day: 1, start: "09:00", end: "12:00" }],
    });
    // Luca works only 11-12; Anna has a weekly 10-11 (Rome) standup in her calendar.
    await agenda.settings.updateHost("s", luca.id, { weekly: [{ day: 1, start: "11:00", end: "12:00" }] });
    db.tables.agenda_calendar_connections = [
      { id: "c1", scope: "s", host_id: anna.id, provider: "ics", account: "feed", credentials: encryptJson(KEY, { url: "https://cal.example.test/a.ics" }), status: "ok" },
    ];

    const day = await agenda.getAvailability({ scope: "s", date: "2026-10-05" });
    if (!day.ok) throw new Error();
    expect(day.slots.map((s) => [s.time, s.remaining])).toEqual([
      ["09:00", 1],
      ["10:00", 0],
      ["11:00", 2],
    ]);

    const first = await agenda.createBooking({ scope: "s", eventTypeId: "intro", startUtc: at("11:00"), guest: guest(1) });
    const second = await agenda.createBooking({ scope: "s", eventTypeId: "intro", startUtc: at("11:00"), guest: guest(2) });
    const third = await agenda.createBooking({ scope: "s", eventTypeId: "intro", startUtc: at("11:00"), guest: guest(3) });
    if (!first.ok || !second.ok) throw new Error("bookings failed");
    expect(new Set([first.booking.hostId, second.booking.hostId])).toEqual(new Set([anna.id, luca.id]));
    expect(third).toEqual({ ok: false, error: "slot_taken" });
    expect(await agenda.createBooking({ scope: "s", eventTypeId: "intro", startUtc: at("10:00"), guest: guest(4) })).toEqual({
      ok: false,
      error: "slot_taken",
    });
  });

  it("deactivates hosts no longer in the staff list", async () => {
    const { agenda } = setup(base);
    await agenda.settings.syncHosts("s", [{ externalId: "u1", name: "A" }, { externalId: "u2", name: "B" }]);
    const after = await agenda.settings.syncHosts("s", [{ externalId: "u1", name: "A" }]);
    expect(after.map((h) => [h.externalId, h.active])).toEqual([
      ["u1", true],
      ["u2", false],
    ]);
  });

  it("marks an unreadable calendar and keeps availability working", async () => {
    const failing = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const { db, agenda } = setup(base, failing);
    const [anna] = await agenda.settings.syncHosts("s", [{ externalId: "u1", name: "Anna" }]);
    await agenda.settings.saveEventType("s", "intro", { staffing: { mode: "hosts", hostIds: [anna.id] } });
    db.tables.agenda_calendar_connections = [
      { id: "c1", scope: "s", host_id: anna.id, provider: "ics", account: "feed", credentials: encryptJson(KEY, { url: "https://x.test/a.ics" }), status: "ok" },
    ];
    const day = await agenda.getAvailability({ scope: "s", date: "2026-10-05" });
    expect(day.ok && day.slots.some((s) => s.available)).toBe(true);
    expect(db.tables.agenda_calendar_connections[0].status).toBe("error");
  });
});
