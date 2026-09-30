import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { assertValidEventType, bookableDays, calendarOf, isBookableStart, overlapsBusy, slotEnd, slotsForDate, } from "../core/availability.js";
import { addDaysISO, isDateISO, isValidTimeZone, zonedWallClockToUtc } from "../core/time.js";
import { createLivekitToken, verifyLivekitWebhook } from "../video/livekit.js";
import { DEFAULT_TABLES } from "./config.js";
import { BOOKING_COLUMNS, toBooking } from "./rows.js";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function clean(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function isUniqueViolation(error) {
    // 23P01 = exclusion_violation (overlap), 23505 = unique_violation (legacy indexes).
    return error?.code === "23P01" || error?.code === "23505";
}
export function createAgendaServer(config) {
    if (!config.signingSecret || config.signingSecret.length < 16) {
        throw new Error("@pynkstudio/agendaapp: signingSecret must be at least 16 characters");
    }
    const tables = { ...DEFAULT_TABLES, ...config.tables };
    const now = () => config.now?.() ?? new Date();
    const warn = (message, error) => config.logger ? config.logger.warn(message, error) : console.warn(`[agendaapp] ${message}`, error ?? "");
    const validated = new WeakSet();
    function eventTypesOf(scope) {
        const list = typeof config.eventTypes === "function" ? config.eventTypes(scope) : config.eventTypes;
        for (const et of list) {
            if (!validated.has(et)) {
                assertValidEventType(et);
                validated.add(et);
            }
        }
        return list;
    }
    function eventType(scope, id) {
        const list = eventTypesOf(scope);
        if (!id)
            return list[0] ?? null;
        return list.find((et) => et.id === id) ?? null;
    }
    function manageTokenFor(bookingId) {
        return createHmac("sha256", config.signingSecret).update(`agenda:manage:${bookingId}`).digest("base64url");
    }
    function verifyManageToken(bookingId, token) {
        if (!token)
            return false;
        const expected = Buffer.from(manageTokenFor(bookingId));
        const actual = Buffer.from(token);
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    }
    function guestUrlFor(booking) {
        return config.guestUrl ? config.guestUrl(booking, manageTokenFor(booking.id)) : null;
    }
    function roomFor(bookingId) {
        return `${config.video?.roomPrefix ?? "agenda-"}${bookingId}`;
    }
    async function busyIntervals(db, scope, calendar, from, to) {
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
        if (bookings.error)
            throw bookings.error;
        if (blocks.error)
            throw blocks.error;
        const out = [];
        for (const r of bookings.data ?? [])
            out.push({ start: new Date(r.starts_at), end: new Date(r.blocked_until) });
        for (const r of blocks.data ?? [])
            out.push({ start: new Date(r.starts_at), end: new Date(r.ends_at) });
        return out;
    }
    async function getBooking(id) {
        const db = config.db();
        if (!db || !id)
            return null;
        const { data, error } = await db.from(tables.bookings).select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
        if (error) {
            // An invalid uuid is a lookup miss, not a server error.
            if (error.code !== "22P02")
                warn("getBooking failed", error);
            return null;
        }
        return data ? toBooking(data) : null;
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
        listBookableDays(scope, eventTypeId) {
            const et = eventType(scope, eventTypeId);
            return et ? bookableDays(et, now()) : [];
        },
        async getAvailability(input) {
            const et = eventType(input.scope, input.eventTypeId);
            if (!et)
                return { ok: false, error: "unknown_event_type" };
            if (!isDateISO(input.date))
                return { ok: false, error: "invalid_date" };
            const at = now();
            if (!bookableDays(et, at).includes(input.date)) {
                return { ok: true, date: input.date, timezone: et.timezone, slots: [] };
            }
            const db = config.db();
            let busy = [];
            if (db) {
                const from = zonedWallClockToUtc(et.timezone, input.date, 0, 0);
                const to = zonedWallClockToUtc(et.timezone, addDaysISO(input.date, 1), 0, 0);
                try {
                    busy = await busyIntervals(db, input.scope, calendarOf(et), from, to);
                }
                catch (error) {
                    warn("availability lookup failed", error);
                    // Without the busy list every slot would look free: offer none.
                    return { ok: true, date: input.date, timezone: et.timezone, slots: [] };
                }
            }
            return { ok: true, date: input.date, timezone: et.timezone, slots: slotsForDate(et, input.date, busy, at) };
        },
        async createBooking(input) {
            const db = config.db();
            if (!db)
                return { ok: false, error: "unconfigured" };
            const et = eventType(input.scope, input.eventTypeId);
            if (!et)
                return { ok: false, error: "unknown_event_type" };
            const name = clean(input.guest.name, 160);
            const email = clean(input.guest.email, 254).toLowerCase();
            const phone = clean(input.guest.phone, 40) || null;
            const topic = clean(input.topic, 2000) || null;
            const guestTz = clean(input.guest.timezone, 64);
            if (!name)
                return { ok: false, error: "invalid_input", field: "name" };
            if (!EMAIL_RE.test(email))
                return { ok: false, error: "invalid_input", field: "email" };
            const start = input.startUtc instanceof Date ? input.startUtc : new Date(input.startUtc);
            if (!isBookableStart(et, start, now()))
                return { ok: false, error: "invalid_slot" };
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
                if (error)
                    throw error;
                const busy = (blocks ?? []).map((b) => ({
                    start: new Date(b.starts_at),
                    end: new Date(b.ends_at),
                }));
                if (overlapsBusy(start, end, busy, et.bufferMinutes))
                    return { ok: false, error: "slot_taken" };
            }
            catch (error) {
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
                if (isUniqueViolation(error))
                    return { ok: false, error: "slot_taken" };
                warn("booking insert failed", error);
                return { ok: false, error: "db_error" };
            }
            const booking = toBooking(data);
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
                }
                catch (hookError) {
                    warn("onBookingCreated hook failed", hookError);
                }
            }
            return { ok: true, booking, manageToken, guestUrl: guestUrlFor(booking) };
        },
        async cancelBooking(input) {
            const db = config.db();
            if (!db)
                return { ok: false, error: "unconfigured" };
            const current = await getBooking(input.id);
            if (!current || (input.scope && current.scope !== input.scope))
                return { ok: false, error: "not_found" };
            if (input.by === "guest" && !verifyManageToken(current.id, input.manageToken)) {
                return { ok: false, error: "forbidden" };
            }
            if (current.status !== "confirmed")
                return { ok: false, error: "not_cancellable" };
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
            if (!data)
                return { ok: false, error: "not_cancellable" };
            const booking = toBooking(data);
            if (config.hooks?.onBookingCancelled) {
                try {
                    await config.hooks.onBookingCancelled({ booking, by: input.by });
                }
                catch (hookError) {
                    warn("onBookingCancelled hook failed", hookError);
                }
            }
            return { ok: true, booking };
        },
        async setStatus(id, status, scope) {
            const db = config.db();
            if (!db)
                return null;
            let query = db.from(tables.bookings).update({ status }).eq("id", id).in("status", ["confirmed", "completed", "no_show"]);
            if (scope)
                query = query.eq("scope", scope);
            const { data, error } = await query.select(BOOKING_COLUMNS).maybeSingle();
            if (error) {
                warn("setStatus failed", error);
                return null;
            }
            return data ? toBooking(data) : null;
        },
        async listBookings(input) {
            const db = config.db();
            if (!db)
                return [];
            let query = db
                .from(tables.bookings)
                .select(BOOKING_COLUMNS)
                .eq("scope", input.scope)
                .gte("starts_at", new Date(input.from).toISOString())
                .lt("starts_at", new Date(input.to).toISOString());
            if (input.statuses?.length)
                query = query.in("status", input.statuses);
            const { data, error } = await query.order("starts_at", { ascending: true });
            if (error) {
                warn("listBookings failed", error);
                return [];
            }
            return data.map(toBooking);
        },
        /**
         * Confirmed bookings starting within `leadMinutes`, marked as reminded in
         * the same UPDATE so that overlapping cron runs never remind twice.
         */
        async claimDueReminders(input) {
            const db = config.db();
            if (!db)
                return [];
            const at = now();
            let query = db
                .from(tables.bookings)
                .update({ reminder_sent_at: at.toISOString() })
                .eq("status", "confirmed")
                .is("reminder_sent_at", null)
                .gt("starts_at", at.toISOString())
                .lte("starts_at", new Date(at.getTime() + input.leadMinutes * 60000).toISOString());
            if (input.scope)
                query = query.eq("scope", input.scope);
            const { data, error } = await query.select(BOOKING_COLUMNS);
            if (error) {
                warn("claimDueReminders failed", error);
                return [];
            }
            return data.map(toBooking);
        },
        async addBlock(input) {
            const db = config.db();
            if (!db)
                return null;
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
            return data;
        },
        async listBlocks(input) {
            const db = config.db();
            if (!db)
                return [];
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
            return data;
        },
        async removeBlock(input) {
            const db = config.db();
            if (!db)
                return false;
            const { error } = await db.from(tables.blocks).delete().eq("id", input.id).eq("scope", input.scope);
            if (error)
                warn("removeBlock failed", error);
            return !error;
        },
        /**
         * A LiveKit access token for a booking's room. The caller authenticates
         * hosts; guests are authenticated by their booking token.
         */
        async issueVideoAccess(input) {
            const video = config.video;
            if (!video)
                return { ok: false, error: "video_disabled" };
            if (!config.db())
                return { ok: false, error: "unconfigured" };
            if (input.as === "guest" && !verifyManageToken(input.bookingId, input.manageToken)) {
                return { ok: false, error: "forbidden" };
            }
            const booking = await getBooking(input.bookingId);
            if (!booking)
                return { ok: false, error: "not_found" };
            if (input.as === "host" && input.scope && booking.scope !== input.scope)
                return { ok: false, error: "not_found" };
            if (booking.location !== "video" || !booking.videoRoom)
                return { ok: false, error: "not_video", booking };
            if (booking.status === "cancelled")
                return { ok: false, error: "cancelled", booking };
            const at = now().getTime();
            const opensAt = new Date(new Date(booking.startsAt).getTime() - (video.joinEarlyMinutes ?? 10) * 60000);
            const closesAt = new Date(booking.endsAt).getTime() + (video.joinLateMinutes ?? 30) * 60000;
            // Hosts may open the room whenever they like before it closes.
            if (input.as === "guest" && at < opensAt.getTime()) {
                return { ok: false, error: "too_early", opensAt: opensAt.toISOString(), booking };
            }
            if (at > closesAt)
                return { ok: false, error: "ended", booking };
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
        async handleLivekitWebhook(rawBody, authorization) {
            const video = config.video;
            if (!video)
                return { ok: false, error: "video_disabled" };
            const event = verifyLivekitWebhook(video, rawBody, authorization, now());
            if (!event)
                return { ok: false, error: "unauthorized" };
            const db = config.db();
            if (!db)
                return { ok: false, error: "unconfigured" };
            const roomName = event.room?.name ?? "";
            let booking = null;
            if (roomName) {
                const { data } = await db.from(tables.bookings).select(BOOKING_COLUMNS).eq("video_room", roomName).maybeSingle();
                booking = data ? toBooking(data) : null;
            }
            // Rooms that are not ours (other apps on the same LiveKit) are acknowledged and ignored.
            if (!booking)
                return { ok: true, event, bookingId: null };
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
                if (insertError.code === "23505")
                    return { ok: true, event, bookingId: booking.id };
                warn("video event insert failed", insertError);
            }
            const stamp = now().toISOString();
            if (event.event === "participant_joined" && !booking.videoStartedAt) {
                await db.from(tables.bookings).update({ video_started_at: stamp }).eq("id", booking.id).is("video_started_at", null);
            }
            if (event.event === "room_finished") {
                const patch = { video_ended_at: stamp };
                if (booking.status === "confirmed" && booking.videoStartedAt)
                    patch.status = "completed";
                await db.from(tables.bookings).update(patch).eq("id", booking.id);
            }
            if (config.hooks?.onVideoEvent) {
                try {
                    await config.hooks.onVideoEvent({ booking, event });
                }
                catch (hookError) {
                    warn("onVideoEvent hook failed", hookError);
                }
            }
            return { ok: true, event, bookingId: booking.id };
        },
    };
}
//# sourceMappingURL=agenda.js.map