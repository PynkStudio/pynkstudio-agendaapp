import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  assertValidEventType,
  bookableDays,
  calendarOf,
  isBookableStart,
  overlapsBusy,
  slotEnd,
  slotsForDate,
} from "../core/availability.js";
import { addDaysISO, isDateISO, isValidTimeZone, zonedWallClockToUtc } from "../core/time.js";
import type { AgendaBooking, AgendaEventType, AgendaSlot, BookingStatus, BusyInterval } from "../core/types.js";
import { createLivekitToken, verifyLivekitWebhook, type LivekitWebhookEvent } from "../video/livekit.js";
import { DEFAULT_TABLES, type AgendaDb, type AgendaServerConfig, type AgendaTables } from "./config.js";
import { BOOKING_COLUMNS, toBooking, type BookingRow } from "./rows.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type GuestInput = {
  name: string;
  email: string;
  phone?: string | null;
  timezone?: string | null;
};

export type CreateBookingInput = {
  scope: string;
  eventTypeId: string;
  startUtc: string | Date;
  guest: GuestInput;
  topic?: string | null;
  answers?: Record<string, unknown>;
  source?: string | null;
  /** Passed to `onBookingCreated` untouched, never stored. */
  extra?: Record<string, unknown>;
};

export type CreateBookingResult =
  | { ok: true; booking: AgendaBooking; manageToken: string; guestUrl: string | null }
  | {
      ok: false;
      error: "unconfigured" | "unknown_event_type" | "invalid_input" | "invalid_slot" | "slot_taken" | "db_error";
      field?: string;
    };

export type CancelBookingInput = {
  id: string;
  by: "host" | "guest" | "system";
  /** Required when `by` is `guest`. */
  manageToken?: string;
  /** When set, the booking must belong to this scope. */
  scope?: string;
  reason?: string | null;
};

export type CancelBookingResult =
  | { ok: true; booking: AgendaBooking }
  | { ok: false; error: "unconfigured" | "not_found" | "forbidden" | "not_cancellable" | "db_error" };

export type VideoAccessInput =
  | { bookingId: string; as: "guest"; manageToken: string }
  | { bookingId: string; as: "host"; identity: string; name: string; scope?: string };

export type VideoAccessResult =
  | {
      ok: true;
      serverUrl: string;
      token: string;
      room: string;
      role: "guest" | "host";
      booking: AgendaBooking;
    }
  | {
      ok: false;
      error: "unconfigured" | "video_disabled" | "not_found" | "forbidden" | "not_video" | "cancelled" | "too_early" | "ended";
      /** With `too_early`: when the room opens. */
      opensAt?: string;
      booking?: AgendaBooking;
    };

export type WebhookResult =
  | { ok: true; event: LivekitWebhookEvent; bookingId: string | null }
  | { ok: false; error: "video_disabled" | "unauthorized" | "unconfigured" };

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  // 23P01 = exclusion_violation (overlap), 23505 = unique_violation (legacy indexes).
  return error?.code === "23P01" || error?.code === "23505";
}

export type AgendaServer = ReturnType<typeof createAgendaServer>;

export function createAgendaServer(config: AgendaServerConfig) {
  if (!config.signingSecret || config.signingSecret.length < 16) {
    throw new Error("@pynkstudio/agendaapp: signingSecret must be at least 16 characters");
  }
  const tables: AgendaTables = { ...DEFAULT_TABLES, ...config.tables };
  const now = () => config.now?.() ?? new Date();
  const warn = (message: string, error?: unknown) =>
    config.logger ? config.logger.warn(message, error) : console.warn(`[agendaapp] ${message}`, error ?? "");

  const validated = new WeakSet<AgendaEventType>();

  function eventTypesOf(scope: string): readonly AgendaEventType[] {
    const list = typeof config.eventTypes === "function" ? config.eventTypes(scope) : config.eventTypes;
    for (const et of list) {
      if (!validated.has(et)) {
        assertValidEventType(et);
        validated.add(et);
      }
    }
    return list;
  }

  function eventType(scope: string, id?: string | null): AgendaEventType | null {
    const list = eventTypesOf(scope);
    if (!id) return list[0] ?? null;
    return list.find((et) => et.id === id) ?? null;
  }

  function manageTokenFor(bookingId: string): string {
    return createHmac("sha256", config.signingSecret).update(`agenda:manage:${bookingId}`).digest("base64url");
  }

  function verifyManageToken(bookingId: string, token: string | null | undefined): boolean {
    if (!token) return false;
    const expected = Buffer.from(manageTokenFor(bookingId));
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  function guestUrlFor(booking: AgendaBooking): string | null {
    return config.guestUrl ? config.guestUrl(booking, manageTokenFor(booking.id)) : null;
  }

  function roomFor(bookingId: string): string {
    return `${config.video?.roomPrefix ?? "agenda-"}${bookingId}`;
  }

  async function busyIntervals(db: AgendaDb, scope: string, calendar: string, from: Date, to: Date): Promise<BusyInterval[]> {
    // Bookings are indexed by start; a day's lookup widens by a few hours to
    // catch long bookings (and their buffer) that began the day before.
    const widenedFrom = new Date(from.getTime() - 12 * 3600000).toISOString();
    const [bookings, blocks] = await Promise.all([
      db
        .from(tables.bookings)
        .select("starts_at, blocked_until")
        .eq("scope", scope)
        .eq("calendar", calendar)
        .eq("status", "confirmed")
        .gte("starts_at", widenedFrom)
        .lt("starts_at", to.toISOString()),
      db
        .from(tables.blocks)
        .select("starts_at, ends_at")
        .eq("scope", scope)
        .eq("calendar", calendar)
        .lt("starts_at", to.toISOString())
        .gt("ends_at", from.toISOString()),
    ]);
    if (bookings.error) throw bookings.error;
    if (blocks.error) throw blocks.error;
    const out: BusyInterval[] = [];
    for (const r of bookings.data ?? []) out.push({ start: new Date(r.starts_at), end: new Date(r.blocked_until) });
    for (const r of blocks.data ?? []) out.push({ start: new Date(r.starts_at), end: new Date(r.ends_at) });
    return out;
  }

  async function getBooking(id: string): Promise<AgendaBooking | null> {
    const db = config.db();
    if (!db || !id) return null;
    const { data, error } = await db.from(tables.bookings).select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
    if (error) {
      // An invalid uuid is a lookup miss, not a server error.
      if (error.code !== "22P02") warn("getBooking failed", error);
      return null;
    }
    return data ? toBooking(data as BookingRow) : null;
  }

  return {
    eventType,
    eventTypes: eventTypesOf,
    manageTokenFor,
    verifyManageToken,
    /** The guest link for a booking, e.g. to put it again in a reminder. Null without `guestUrl`. */
    guestUrlFor,
    roomFor,
    getBooking,

    /** Dates that can be offered in a date picker. */
    listBookableDays(scope: string, eventTypeId?: string | null): string[] {
      const et = eventType(scope, eventTypeId);
      return et ? bookableDays(et, now()) : [];
    },

    async getAvailability(input: {
      scope: string;
      eventTypeId?: string | null;
      date: string;
    }): Promise<{ ok: true; date: string; timezone: string; slots: AgendaSlot[] } | { ok: false; error: "unknown_event_type" | "invalid_date" }> {
      const et = eventType(input.scope, input.eventTypeId);
      if (!et) return { ok: false, error: "unknown_event_type" };
      if (!isDateISO(input.date)) return { ok: false, error: "invalid_date" };
      const at = now();
      if (!bookableDays(et, at).includes(input.date)) {
        return { ok: true, date: input.date, timezone: et.timezone, slots: [] };
      }
      const db = config.db();
      let busy: BusyInterval[] = [];
      if (db) {
        const from = zonedWallClockToUtc(et.timezone, input.date, 0, 0);
        const to = zonedWallClockToUtc(et.timezone, addDaysISO(input.date, 1), 0, 0);
        try {
          busy = await busyIntervals(db, input.scope, calendarOf(et), from, to);
        } catch (error) {
          warn("availability lookup failed", error);
          // Without the busy list every slot would look free: offer none.
          return { ok: true, date: input.date, timezone: et.timezone, slots: [] };
        }
      }
      return { ok: true, date: input.date, timezone: et.timezone, slots: slotsForDate(et, input.date, busy, at) };
    },

    async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      const db = config.db();
      if (!db) return { ok: false, error: "unconfigured" };
      const et = eventType(input.scope, input.eventTypeId);
      if (!et) return { ok: false, error: "unknown_event_type" };

      const name = clean(input.guest.name, 160);
      const email = clean(input.guest.email, 254).toLowerCase();
      const phone = clean(input.guest.phone, 40) || null;
      const topic = clean(input.topic, 2000) || null;
      const guestTz = clean(input.guest.timezone, 64);
      if (!name) return { ok: false, error: "invalid_input", field: "name" };
      if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_input", field: "email" };

      const start = input.startUtc instanceof Date ? input.startUtc : new Date(input.startUtc);
      if (!isBookableStart(et, start, now())) return { ok: false, error: "invalid_slot" };
      const end = slotEnd(et, start);
      const blockedUntil = new Date(end.getTime() + (et.bufferMinutes ?? 0) * 60000);
      const calendar = calendarOf(et);

      // Host blocks are not covered by the exclusion constraint, check them here.
      try {
        const { data: blocks, error } = await db
          .from(tables.blocks)
          .select("starts_at, ends_at")
          .eq("scope", input.scope)
          .eq("calendar", calendar)
          .lt("starts_at", blockedUntil.toISOString())
          .gt("ends_at", start.toISOString());
        if (error) throw error;
        const busy = (blocks ?? []).map((b: { starts_at: string; ends_at: string }) => ({
          start: new Date(b.starts_at),
          end: new Date(b.ends_at),
        }));
        if (overlapsBusy(start, end, busy, et.bufferMinutes)) return { ok: false, error: "slot_taken" };
      } catch (error) {
        warn("block lookup failed", error);
        return { ok: false, error: "db_error" };
      }

      const id = randomUUID();
      const { data, error } = await db
        .from(tables.bookings)
        .insert({
          id,
          scope: input.scope,
          event_type: et.id,
          calendar,
          status: "confirmed",
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          blocked_until: blockedUntil.toISOString(),
          location: et.location,
          name,
          email,
          phone,
          topic,
          guest_timezone: guestTz && isValidTimeZone(guestTz) ? guestTz : null,
          answers: input.answers ?? {},
          source: clean(input.source, 60) || null,
          video_room: et.location === "video" ? roomFor(id) : null,
        })
        .select(BOOKING_COLUMNS)
        .single();

      if (error) {
        if (isUniqueViolation(error)) return { ok: false, error: "slot_taken" };
        warn("booking insert failed", error);
        return { ok: false, error: "db_error" };
      }

      const booking = toBooking(data as BookingRow);
      const manageToken = manageTokenFor(booking.id);
      if (config.hooks?.onBookingCreated) {
        try {
          await config.hooks.onBookingCreated({
            booking,
            eventType: et,
            manageToken,
            guestUrl: guestUrlFor(booking),
            extra: input.extra ?? {},
          });
        } catch (hookError) {
          warn("onBookingCreated hook failed", hookError);
        }
      }
      return { ok: true, booking, manageToken, guestUrl: guestUrlFor(booking) };
    },

    async cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult> {
      const db = config.db();
      if (!db) return { ok: false, error: "unconfigured" };
      const current = await getBooking(input.id);
      if (!current || (input.scope && current.scope !== input.scope)) return { ok: false, error: "not_found" };
      if (input.by === "guest" && !verifyManageToken(current.id, input.manageToken)) {
        return { ok: false, error: "forbidden" };
      }
      if (current.status !== "confirmed") return { ok: false, error: "not_cancellable" };

      const { data, error } = await db
        .from(tables.bookings)
        .update({
          status: "cancelled",
          cancelled_at: now().toISOString(),
          cancelled_by: input.by,
          cancel_reason: clean(input.reason, 500) || null,
        })
        .eq("id", current.id)
        .eq("status", "confirmed")
        .select(BOOKING_COLUMNS)
        .maybeSingle();
      if (error) {
        warn("cancel failed", error);
        return { ok: false, error: "db_error" };
      }
      if (!data) return { ok: false, error: "not_cancellable" };

      const booking = toBooking(data as BookingRow);
      if (config.hooks?.onBookingCancelled) {
        try {
          await config.hooks.onBookingCancelled({ booking, by: input.by });
        } catch (hookError) {
          warn("onBookingCancelled hook failed", hookError);
        }
      }
      return { ok: true, booking };
    },

    async setStatus(id: string, status: Extract<BookingStatus, "completed" | "no_show">, scope?: string): Promise<AgendaBooking | null> {
      const db = config.db();
      if (!db) return null;
      let query = db.from(tables.bookings).update({ status }).eq("id", id).in("status", ["confirmed", "completed", "no_show"]);
      if (scope) query = query.eq("scope", scope);
      const { data, error } = await query.select(BOOKING_COLUMNS).maybeSingle();
      if (error) {
        warn("setStatus failed", error);
        return null;
      }
      return data ? toBooking(data as BookingRow) : null;
    },

    async listBookings(input: {
      scope: string;
      from: Date | string;
      to: Date | string;
      statuses?: readonly BookingStatus[];
    }): Promise<AgendaBooking[]> {
      const db = config.db();
      if (!db) return [];
      let query = db
        .from(tables.bookings)
        .select(BOOKING_COLUMNS)
        .eq("scope", input.scope)
        .gte("starts_at", new Date(input.from).toISOString())
        .lt("starts_at", new Date(input.to).toISOString());
      if (input.statuses?.length) query = query.in("status", input.statuses);
      const { data, error } = await query.order("starts_at", { ascending: true });
      if (error) {
        warn("listBookings failed", error);
        return [];
      }
      return (data as BookingRow[]).map(toBooking);
    },

    /**
     * Confirmed bookings starting within `leadMinutes`, marked as reminded in
     * the same UPDATE so that overlapping cron runs never remind twice.
     */
    async claimDueReminders(input: { leadMinutes: number; scope?: string }): Promise<AgendaBooking[]> {
      const db = config.db();
      if (!db) return [];
      const at = now();
      let query = db
        .from(tables.bookings)
        .update({ reminder_sent_at: at.toISOString() })
        .eq("status", "confirmed")
        .is("reminder_sent_at", null)
        .gt("starts_at", at.toISOString())
        .lte("starts_at", new Date(at.getTime() + input.leadMinutes * 60000).toISOString());
      if (input.scope) query = query.eq("scope", input.scope);
      const { data, error } = await query.select(BOOKING_COLUMNS);
      if (error) {
        warn("claimDueReminders failed", error);
        return [];
      }
      return (data as BookingRow[]).map(toBooking);
    },

    async addBlock(input: { scope: string; calendar?: string; startsAt: Date | string; endsAt: Date | string; reason?: string | null }) {
      const db = config.db();
      if (!db) return null;
      const { data, error } = await db
        .from(tables.blocks)
        .insert({
          scope: input.scope,
          calendar: input.calendar ?? "default",
          starts_at: new Date(input.startsAt).toISOString(),
          ends_at: new Date(input.endsAt).toISOString(),
          reason: clean(input.reason, 300) || null,
        })
        .select("id, scope, calendar, starts_at, ends_at, reason")
        .single();
      if (error) {
        warn("addBlock failed", error);
        return null;
      }
      return data as { id: string; scope: string; calendar: string; starts_at: string; ends_at: string; reason: string | null };
    },

    async listBlocks(input: { scope: string; from: Date | string; to: Date | string }) {
      const db = config.db();
      if (!db) return [];
      const { data, error } = await db
        .from(tables.blocks)
        .select("id, scope, calendar, starts_at, ends_at, reason")
        .eq("scope", input.scope)
        .lt("starts_at", new Date(input.to).toISOString())
        .gt("ends_at", new Date(input.from).toISOString())
        .order("starts_at", { ascending: true });
      if (error) {
        warn("listBlocks failed", error);
        return [];
      }
      return data as Array<{ id: string; scope: string; calendar: string; starts_at: string; ends_at: string; reason: string | null }>;
    },

    async removeBlock(input: { scope: string; id: string }): Promise<boolean> {
      const db = config.db();
      if (!db) return false;
      const { error } = await db.from(tables.blocks).delete().eq("id", input.id).eq("scope", input.scope);
      if (error) warn("removeBlock failed", error);
      return !error;
    },

    /**
     * A LiveKit access token for a booking's room. The caller authenticates
     * hosts; guests are authenticated by their booking token.
     */
    async issueVideoAccess(input: VideoAccessInput): Promise<VideoAccessResult> {
      const video = config.video;
      if (!video) return { ok: false, error: "video_disabled" };
      if (!config.db()) return { ok: false, error: "unconfigured" };
      if (input.as === "guest" && !verifyManageToken(input.bookingId, input.manageToken)) {
        return { ok: false, error: "forbidden" };
      }
      const booking = await getBooking(input.bookingId);
      if (!booking) return { ok: false, error: "not_found" };
      if (input.as === "host" && input.scope && booking.scope !== input.scope) return { ok: false, error: "not_found" };
      if (booking.location !== "video" || !booking.videoRoom) return { ok: false, error: "not_video", booking };
      if (booking.status === "cancelled") return { ok: false, error: "cancelled", booking };

      const at = now().getTime();
      const opensAt = new Date(new Date(booking.startsAt).getTime() - (video.joinEarlyMinutes ?? 10) * 60000);
      const closesAt = new Date(booking.endsAt).getTime() + (video.joinLateMinutes ?? 30) * 60000;
      // Hosts may open the room whenever they like before it closes.
      if (input.as === "guest" && at < opensAt.getTime()) {
        return { ok: false, error: "too_early", opensAt: opensAt.toISOString(), booking };
      }
      if (at > closesAt) return { ok: false, error: "ended", booking };

      const identity = input.as === "guest" ? `guest:${booking.id}` : `host:${input.identity}`;
      const token = createLivekitToken(video, {
        identity,
        name: input.as === "guest" ? booking.name : input.name,
        metadata: JSON.stringify({ role: input.as, bookingId: booking.id }),
        ttlSeconds: video.tokenTtlSeconds,
        grant: { room: booking.videoRoom, roomJoin: true, roomAdmin: input.as === "host" },
        now: new Date(at),
      });
      return { ok: true, serverUrl: video.url, token, room: booking.videoRoom, role: input.as, booking };
    },

    async handleLivekitWebhook(rawBody: string, authorization: string | null): Promise<WebhookResult> {
      const video = config.video;
      if (!video) return { ok: false, error: "video_disabled" };
      const event = verifyLivekitWebhook(video, rawBody, authorization, now());
      if (!event) return { ok: false, error: "unauthorized" };
      const db = config.db();
      if (!db) return { ok: false, error: "unconfigured" };

      const roomName = event.room?.name ?? "";
      let booking: AgendaBooking | null = null;
      if (roomName) {
        const { data } = await db.from(tables.bookings).select(BOOKING_COLUMNS).eq("video_room", roomName).maybeSingle();
        booking = data ? toBooking(data as BookingRow) : null;
      }
      // Rooms that are not ours (other apps on the same LiveKit) are acknowledged and ignored.
      if (!booking) return { ok: true, event, bookingId: null };

      const { error: insertError } = await db.from(tables.videoEvents).insert({
        booking_id: booking.id,
        room: roomName,
        event: event.event,
        participant_identity: event.participant?.identity ?? null,
        livekit_event_id: event.id ?? null,
        payload: event,
      });
      if (insertError) {
        // Redelivery of an event we already processed.
        if (insertError.code === "23505") return { ok: true, event, bookingId: booking.id };
        warn("video event insert failed", insertError);
      }

      const stamp = now().toISOString();
      if (event.event === "participant_joined" && !booking.videoStartedAt) {
        await db.from(tables.bookings).update({ video_started_at: stamp }).eq("id", booking.id).is("video_started_at", null);
      }
      if (event.event === "room_finished") {
        const patch: Record<string, unknown> = { video_ended_at: stamp };
        if (booking.status === "confirmed" && booking.videoStartedAt) patch.status = "completed";
        await db.from(tables.bookings).update(patch).eq("id", booking.id);
      }

      if (config.hooks?.onVideoEvent) {
        try {
          await config.hooks.onVideoEvent({ booking, event });
        } catch (hookError) {
          warn("onVideoEvent hook failed", hookError);
        }
      }
      return { ok: true, event, bookingId: booking.id };
    },
  };
}
