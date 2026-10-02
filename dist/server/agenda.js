import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createCalendarService } from "../calendars/service.js";
import { availableSlots, bookableDays, freeResourcesAt, isBookableStart, seatResources, slotEnd } from "../core/availability.js";
import { addDaysISO, isDateISO, isValidTimeZone, zonedDateISO, zonedWallClockToUtc } from "../core/time.js";
import { createLivekitToken, verifyLivekitWebhook } from "../video/livekit.js";
import { DEFAULT_TABLES } from "./config.js";
import { BOOKING_COLUMNS, toBooking } from "./rows.js";
import { createSettingsStore } from "./settings.js";
/** Block that closes every resource of a scope. */
export const ALL_CALENDARS = "*";
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
    const settings = createSettingsStore({
        db: config.db,
        tables,
        defaults: (scope) => (typeof config.eventTypes === "function" ? config.eventTypes(scope) : config.eventTypes),
        warn,
    });
    const calendars = createCalendarService({
        db: config.db,
        config: config.calendars,
        signingSecret: config.signingSecret,
        table: tables.connections,
        warn,
    });
    async function eventType(scope, id) {
        const list = await settings.eventTypes(scope);
        if (!id)
            return list[0] ?? null;
        return list.find((et) => et.id === id) ?? null;
    }
    /** Midnight-to-midnight of the slot's date in the event's zone: the unit busy lists are fetched and cached by. */
    function dayRange(et, dateISO) {
        return {
            from: zonedWallClockToUtc(et.timezone, dateISO, 0, 0),
            to: zonedWallClockToUtc(et.timezone, addDaysISO(dateISO, 1), 0, 0),
        };
    }
    /**
     * Seats or hosts of an event type, each with what keeps it busy in
     * [from, to): its confirmed bookings, host blocks and, for hosts, their
     * connected calendars.
     */
    async function resourcesFor(db, scope, et, from, to) {
        let base;
        let external = new Map();
        if (et.staffing?.mode === "hosts") {
            const wanted = new Set(et.staffing.hostIds);
            const hosts = (await settings.hosts(scope)).filter((h) => h.active && wanted.has(h.id));
            base = hosts.map((h) => ({ id: `host:${h.id}`, hostId: h.id, windows: h.weekly?.length ? h.weekly : et.weekly }));
            external = await calendars.busyByHost(scope, hosts.map((h) => h.id), from, to);
        }
        else {
            base = seatResources(et);
        }
        if (base.length === 0)
            return [];
        const ids = base.map((r) => r.id);
        // Bookings are indexed by start; widen by half a day to catch long ones that began earlier.
        const widenedFrom = new Date(from.getTime() - 12 * 3600000).toISOString();
        const [bookings, blocks] = await Promise.all([
            db
                .from(tables.bookings)
                .select("calendar, starts_at, blocked_until")
                .eq("scope", scope)
                .in("calendar", ids)
                .eq("status", "confirmed")
                .gte("starts_at", widenedFrom)
                .lt("starts_at", to.toISOString()),
            db
                .from(tables.blocks)
                .select("calendar, starts_at, ends_at")
                .eq("scope", scope)
                .in("calendar", [...ids, ALL_CALENDARS])
                .lt("starts_at", to.toISOString())
                .gt("ends_at", from.toISOString()),
        ]);
        if (bookings.error)
            throw bookings.error;
        if (blocks.error)
            throw blocks.error;
        const busy = new Map(ids.map((id) => [id, []]));
        for (const r of bookings.data ?? [])
            busy.get(r.calendar)?.push({ start: new Date(r.starts_at), end: new Date(r.blocked_until) });
        for (const r of blocks.data ?? []) {
            const interval = { start: new Date(r.starts_at), end: new Date(r.ends_at) };
            if (r.calendar === ALL_CALENDARS)
                for (const list of busy.values())
                    list.push(interval);
            else
                busy.get(r.calendar)?.push(interval);
        }
        return base.map((r) => ({ ...r, busy: [...(busy.get(r.id) ?? []), ...(r.hostId ? (external.get(r.hostId) ?? []) : [])] }));
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
    function guestDisplayName(booking) {
        const custom = config.guestDisplayName?.(booking)?.trim();
        return custom || booking.name;
    }
    function roomFor(bookingId) {
        return `${config.video?.roomPrefix ?? "agenda-"}${bookingId}`;
    }
    /**
     * Puts the booking into the assigned host's chosen calendar. Best effort:
     * a failure is logged and never undoes the booking.
     */
    async function writeToHostCalendar(db, booking, et) {
        if (!booking.hostId || !calendars.enabled())
            return;
        const host = (await settings.hosts(booking.scope)).find((h) => h.id === booking.hostId);
        if (!host?.writeTarget)
            return;
        const custom = config.hostCalendarEvent?.(booking, et) ?? {};
        const description = custom.description ??
            [booking.topic && `Topic: ${booking.topic}`, `Email: ${booking.email}`, booking.phone && `Phone: ${booking.phone}`].filter(Boolean).join("\n");
        try {
            const ref = await calendars.writeEvent(booking.scope, host.writeTarget.connectionId, host.writeTarget.calendarId, {
                uid: `${booking.id}@agendaapp`,
                title: custom.title ?? `${et.title} — ${guestDisplayName(booking)}`,
                description,
                location: custom.location,
                start: new Date(booking.startsAt),
                end: new Date(booking.endsAt),
            });
            await db.from(tables.bookings).update({ external_event: ref }).eq("id", booking.id);
        }
        catch (error) {
            warn(`writing booking ${booking.id} into the host calendar failed`, error);
        }
    }
    async function removeFromHostCalendar(db, bookingId, scope, ref) {
        if (!ref?.connectionId || !calendars.enabled())
            return;
        try {
            await calendars.deleteEvent(scope, ref);
            await db.from(tables.bookings).update({ external_event: null }).eq("id", bookingId);
        }
        catch (error) {
            warn(`removing booking ${bookingId} from the host calendar failed`, error);
        }
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
        eventTypes: (scope) => settings.eventTypes(scope),
        /** Settings page backend: event types, hosts. */
        settings,
        /** Connected calendars (Google, Microsoft, CalDAV, ICS). */
        calendars,
        manageTokenFor,
        verifyManageToken,
        /** The guest link for a booking, e.g. to put it again in a reminder. Null without `guestUrl`. */
        guestUrlFor,
        /** Name the guest appears with in the call (`guestDisplayName`, else the booking name). */
        guestDisplayName,
        roomFor,
        getBooking,
        /**
         * The booking as an event for the guest's own calendar: feed it to
         * `eventIcs`, `googleCalendarLink` or `outlookCalendarLink` (from `/core`).
         */
        async guestCalendarEvent(booking) {
            const et = await eventType(booking.scope, booking.eventType);
            const custom = config.guestCalendarEvent?.(booking, et) ?? {};
            const url = guestUrlFor(booking) ?? undefined;
            return {
                uid: `${booking.id}@agendaapp`,
                start: booking.startsAt,
                end: booking.endsAt,
                title: custom.title ?? et?.title ?? "Appointment",
                description: custom.description,
                location: custom.location ?? (booking.location === "video" ? url : undefined),
                url,
                organizer: custom.organizer,
            };
        },
        /** Dates that can be offered in a date picker. */
        async listBookableDays(scope, eventTypeId) {
            const et = await eventType(scope, eventTypeId);
            return et ? bookableDays(et, now()) : [];
        },
        async getAvailability(input) {
            const et = await eventType(input.scope, input.eventTypeId);
            if (!et)
                return { ok: false, error: "unknown_event_type" };
            if (!isDateISO(input.date))
                return { ok: false, error: "invalid_date" };
            const at = now();
            if (!bookableDays(et, at).includes(input.date)) {
                return { ok: true, date: input.date, timezone: et.timezone, slots: [] };
            }
            const db = config.db();
            // Without a database there is nothing to check against: offer nothing.
            if (!db)
                return { ok: true, date: input.date, timezone: et.timezone, slots: [] };
            try {
                const { from, to } = dayRange(et, input.date);
                const resources = await resourcesFor(db, input.scope, et, from, to);
                return { ok: true, date: input.date, timezone: et.timezone, slots: availableSlots(et, input.date, resources, at) };
            }
            catch (error) {
                warn("availability lookup failed", error);
                // Without the busy list every slot would look free: offer none.
                return { ok: true, date: input.date, timezone: et.timezone, slots: [] };
            }
        },
        async createBooking(input) {
            const db = config.db();
            if (!db)
                return { ok: false, error: "unconfigured" };
            const et = await eventType(input.scope, input.eventTypeId);
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
            // Blocks and external calendars are outside the exclusion constraint:
            // pick among resources free right now; the constraint settles races.
            let candidates;
            let loads;
            try {
                const { from, to } = dayRange(et, zonedDateISO(et.timezone, start));
                const resources = await resourcesFor(db, input.scope, et, from, to);
                candidates = freeResourcesAt(et, start, resources);
                loads = new Map(resources.map((r) => [r.id, r.busy.length]));
            }
            catch (error) {
                warn("availability lookup failed", error);
                return { ok: false, error: "db_error" };
            }
            if (candidates.length === 0)
                return { ok: false, error: "slot_taken" };
            // Least busy first, so bookings spread across the team.
            candidates.sort((a, b) => (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0) || Math.random() - 0.5);
            const id = randomUUID();
            let data = null;
            for (const resource of candidates) {
                const insert = await db
                    .from(tables.bookings)
                    .insert({
                    id,
                    scope: input.scope,
                    event_type: et.id,
                    calendar: resource.id,
                    host_id: resource.hostId,
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
                if (!insert.error) {
                    data = insert.data;
                    break;
                }
                // Someone took this resource meanwhile: try the next free one.
                if (isUniqueViolation(insert.error))
                    continue;
                warn("booking insert failed", insert.error);
                return { ok: false, error: "db_error" };
            }
            if (!data)
                return { ok: false, error: "slot_taken" };
            const booking = toBooking(data);
            await writeToHostCalendar(db, booking, et);
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
            await removeFromHostCalendar(db, booking.id, booking.scope, data.external_event);
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
                calendar: input.calendar ?? ALL_CALENDARS,
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
                name: input.as === "guest" ? guestDisplayName(booking) : input.name,
                metadata: JSON.stringify({ role: input.as, bookingId: booking.id }),
                ttlSeconds: video.tokenTtlSeconds,
                grant: { room: booking.videoRoom, roomJoin: true, roomAdmin: input.as === "host" },
                now: new Date(at),
            });
            return {
                ok: true,
                serverUrl: video.url,
                token,
                room: booking.videoRoom,
                role: input.as,
                displayName: input.as === "guest" ? guestDisplayName(booking) : input.name,
                booking,
            };
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