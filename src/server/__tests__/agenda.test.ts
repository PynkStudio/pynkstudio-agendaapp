import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { AgendaEventType } from "../../core/types.js";
import { verifyHs256 } from "../../video/livekit.js";
import { createAgendaHandlers } from "../../http/handlers.js";
import { createAgendaServer } from "../agenda.js";
import { createFakeDb } from "./fake-db.js";

const call: AgendaEventType = {
  id: "call-20",
  title: "Call",
  durationMinutes: 20,
  timezone: "Europe/Rome",
  weekly: [1, 2, 3, 4, 5].map((day) => ({ day: day as 1, start: "10:00", end: "18:00" })),
  bufferMinutes: 0,
  location: "video",
};

const video = { url: "wss://video.example.test", apiKey: "APIkey", apiSecret: "livekit-secret-livekit-secret" };

function setup(nowIso = "2026-10-05T06:00:00Z") {
  const db = createFakeDb();
  let now = new Date(nowIso);
  const onBookingCreated = vi.fn();
  const onBookingCancelled = vi.fn();
  const agenda = createAgendaServer({
    db: () => db,
    eventTypes: [call],
    signingSecret: "a-very-long-signing-secret",
    video,
    guestUrl: (b, t) => `https://example.test/call/${b.id}?t=${t}`,
    hooks: { onBookingCreated, onBookingCancelled },
    now: () => now,
    logger: { warn: () => {} },
  });
  return { db, agenda, onBookingCreated, onBookingCancelled, setNow: (iso: string) => (now = new Date(iso)) };
}

const guest = { name: "Ada Lovelace", email: "Ada@Example.com", phone: "+39 333" };

describe("createBooking", () => {
  it("books a slot, derives a stable guest token and fires the hook", async () => {
    const { agenda, onBookingCreated } = setup();
    const result = await agenda.createBooking({
      scope: "acme",
      eventTypeId: "call-20",
      startUtc: "2026-10-05T08:20:00.000Z",
      guest,
      topic: "Onboarding",
      extra: { company: "ACME" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.booking).toMatchObject({
      email: "ada@example.com",
      endsAt: "2026-10-05T08:40:00.000Z",
      location: "video",
      videoRoom: `agenda-${result.booking.id}`,
    });
    expect(result.manageToken).toBe(agenda.manageTokenFor(result.booking.id));
    expect(agenda.verifyManageToken(result.booking.id, result.manageToken)).toBe(true);
    expect(agenda.verifyManageToken(result.booking.id, "wrong")).toBe(false);
    expect(onBookingCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: { company: "ACME" },
        guestUrl: `https://example.test/call/${result.booking.id}?t=${result.manageToken}`,
      }),
    );
    expect(result.guestUrl).toBe(agenda.guestUrlFor(result.booking));
  });

  it("refuses an overlapping booking and slots that are not offered", async () => {
    const { agenda } = setup();
    const input = { scope: "acme", eventTypeId: "call-20", startUtc: "2026-10-05T08:20:00.000Z", guest };
    expect((await agenda.createBooking(input)).ok).toBe(true);
    expect(await agenda.createBooking(input)).toEqual({ ok: false, error: "slot_taken" });
    // Another scope has its own calendar.
    expect((await agenda.createBooking({ ...input, scope: "other" })).ok).toBe(true);
    expect(await agenda.createBooking({ ...input, startUtc: "2026-10-05T08:25:00.000Z" })).toEqual({ ok: false, error: "invalid_slot" });
    expect(await agenda.createBooking({ ...input, guest: { ...guest, email: "nope" } })).toMatchObject({ error: "invalid_input", field: "email" });
  });

  it("respects host blocks", async () => {
    const { agenda } = setup();
    await agenda.addBlock({ scope: "acme", startsAt: "2026-10-05T08:00:00Z", endsAt: "2026-10-05T10:00:00Z" });
    const result = await agenda.createBooking({ scope: "acme", eventTypeId: "call-20", startUtc: "2026-10-05T08:20:00.000Z", guest });
    expect(result).toEqual({ ok: false, error: "slot_taken" });
    const day = await agenda.getAvailability({ scope: "acme", date: "2026-10-05" });
    expect(day.ok && day.slots.find((s) => s.time === "10:20")?.available).toBe(false);
    expect(day.ok && day.slots.find((s) => s.time === "12:00")?.available).toBe(true);
  });
});

describe("cancel and reminders", () => {
  it("lets the guest cancel only with the token, and frees the slot", async () => {
    const { agenda, onBookingCancelled } = setup();
    const r = await agenda.createBooking({ scope: "acme", eventTypeId: "call-20", startUtc: "2026-10-05T08:20:00.000Z", guest });
    if (!r.ok) throw new Error("booking failed");
    expect(await agenda.cancelBooking({ id: r.booking.id, by: "guest", manageToken: "x" })).toEqual({ ok: false, error: "forbidden" });
    expect((await agenda.cancelBooking({ id: r.booking.id, by: "guest", manageToken: r.manageToken })).ok).toBe(true);
    expect(onBookingCancelled).toHaveBeenCalledOnce();
    expect(await agenda.cancelBooking({ id: r.booking.id, by: "host" })).toEqual({ ok: false, error: "not_cancellable" });
    const again = await agenda.createBooking({ scope: "acme", eventTypeId: "call-20", startUtc: "2026-10-05T08:20:00.000Z", guest });
    expect(again.ok).toBe(true);
  });

  it("claims each reminder once", async () => {
    const { agenda, setNow } = setup();
    await agenda.createBooking({ scope: "acme", eventTypeId: "call-20", startUtc: "2026-10-05T08:20:00.000Z", guest });
    setNow("2026-10-05T08:05:00Z");
    expect(await agenda.claimDueReminders({ leadMinutes: 20 })).toHaveLength(1);
    expect(await agenda.claimDueReminders({ leadMinutes: 20 })).toHaveLength(0);
  });
});

describe("video", () => {
  it("opens the room to the guest only near the start, and always to the host before it closes", async () => {
    const { agenda, setNow } = setup();
    const r = await agenda.createBooking({ scope: "acme", eventTypeId: "call-20", startUtc: "2026-10-05T08:20:00.000Z", guest });
    if (!r.ok) throw new Error("booking failed");
    const asGuest = { bookingId: r.booking.id, as: "guest" as const, manageToken: r.manageToken };

    expect(await agenda.issueVideoAccess(asGuest)).toMatchObject({ ok: false, error: "too_early", opensAt: "2026-10-05T08:10:00.000Z" });
    const host = await agenda.issueVideoAccess({ bookingId: r.booking.id, as: "host", identity: "u1", name: "Staff" });
    expect(host.ok).toBe(true);

    setNow("2026-10-05T08:15:00Z");
    const access = await agenda.issueVideoAccess(asGuest);
    expect(access.ok).toBe(true);
    if (!access.ok) return;
    const claims = verifyHs256(access.token, video.apiSecret, new Date("2026-10-05T08:15:00Z"));
    expect(claims).toMatchObject({ sub: `guest:${r.booking.id}`, name: "Ada Lovelace", video: { room: access.room, roomAdmin: false } });

    expect(await agenda.issueVideoAccess({ ...asGuest, manageToken: "bad" })).toMatchObject({ ok: false, error: "forbidden" });
    setNow("2026-10-05T09:30:00Z");
    expect(await agenda.issueVideoAccess(asGuest)).toMatchObject({ ok: false, error: "ended" });
  });

  it("records webhook events once and completes the booking when the room finishes", async () => {
    const { agenda, db } = setup();
    const r = await agenda.createBooking({ scope: "acme", eventTypeId: "call-20", startUtc: "2026-10-05T08:20:00.000Z", guest });
    if (!r.ok) throw new Error("booking failed");
    const send = (event: object) => {
      const body = JSON.stringify(event);
      const nowSec = Math.floor(new Date("2026-10-05T06:00:00Z").getTime() / 1000);
      const head = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ iss: video.apiKey, exp: nowSec + 300, sha256: createHash("sha256").update(body).digest("base64") }),
      ).toString("base64url");
      const sig = createHmac("sha256", video.apiSecret).update(`${head}.${payload}`).digest("base64url");
      return agenda.handleLivekitWebhook(body, `${head}.${payload}.${sig}`);
    };
    const room = { name: r.booking.videoRoom };
    await send({ event: "participant_joined", id: "E1", room, participant: { identity: `guest:${r.booking.id}` } });
    await send({ event: "participant_joined", id: "E1", room, participant: { identity: `guest:${r.booking.id}` } });
    await send({ event: "room_finished", id: "E2", room });
    expect(db.tables.agenda_video_events).toHaveLength(2);
    const stored = await agenda.getBooking(r.booking.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.videoStartedAt).not.toBeNull();
    expect(await agenda.handleLivekitWebhook("{}", "garbage")).toEqual({ ok: false, error: "unauthorized" });
  });
});

describe("http handlers", () => {
  it("serves days, slots and bookings over fetch Request/Response", async () => {
    const { agenda } = setup();
    const h = createAgendaHandlers({
      agenda,
      requiredFields: ["phone"],
      exposeGuestUrl: true,
    });
    const ctx = { scope: "acme" };
    const days = await (await h.availability(new Request("https://x/a"), ctx)).json();
    expect(days.days[0]).toBe("2026-10-05");
    const slots = await (await h.availability(new Request("https://x/a?date=2026-10-05"), ctx)).json();
    expect(slots.slots).toHaveLength(24);

    const post = (body: object) =>
      h.book(new Request("https://x/b", { method: "POST", body: JSON.stringify(body) }), ctx);
    expect((await post({ name: "A", email: "a@b.co", startUtc: "2026-10-05T08:20:00.000Z" })).status).toBe(400);
    const ok = await post({ ...guest, startUtc: "2026-10-05T08:20:00.000Z" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).guestUrl).toMatch(/^https:\/\/example\.test\/call\//);
    expect((await post({ ...guest, startUtc: "2026-10-05T08:20:00.000Z" })).status).toBe(409);

    const unauth = await h.hostList(new Request("https://x/h?from=2026-10-01&to=2026-10-10"), ctx);
    expect(unauth.status).toBe(401);
  });
});
