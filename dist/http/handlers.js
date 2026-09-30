/**
 * Web-standard `(Request) => Response` handlers. They work as Next.js route
 * handlers and in any fetch-based runtime. The host resolves the scope (which
 * tenant or project the request is for) and authenticates its own staff;
 * everything else is here.
 */
const STANDARD_KEYS = new Set([
    "eventType",
    "startUtc",
    "name",
    "email",
    "phone",
    "topic",
    "timezone",
    "source",
    "answers",
]);
function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}
async function readJson(request) {
    try {
        const body = await request.json();
        return body && typeof body === "object" && !Array.isArray(body) ? body : null;
    }
    catch {
        return null;
    }
}
function str(value) {
    return typeof value === "string" ? value : "";
}
/** Booking fields safe to show to staff. */
export function serializeBooking(b) {
    return {
        id: b.id,
        eventType: b.eventType,
        status: b.status,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        location: b.location,
        name: b.name,
        email: b.email,
        phone: b.phone,
        topic: b.topic,
        guestTimezone: b.guestTimezone,
        answers: b.answers,
        source: b.source,
        videoStartedAt: b.videoStartedAt,
        videoEndedAt: b.videoEndedAt,
        cancelledAt: b.cancelledAt,
        cancelReason: b.cancelReason,
        createdAt: b.createdAt,
    };
}
const HOST_STATUS_ACTIONS = {
    complete: "completed",
    no_show: "no_show",
};
export function createAgendaHandlers(config) {
    const agenda = () => (typeof config.agenda === "function" ? config.agenda() : config.agenda);
    const required = new Set(config.requiredFields ?? []);
    async function host(request, scope) {
        return config.authorizeHost ? await config.authorizeHost(request, scope) : null;
    }
    return {
        /**
         * `GET ?event=ID` → `{ days }`, the bookable dates.
         * `GET ?event=ID&date=YYYY-MM-DD` → `{ date, timezone, slots }`. No personal data.
         */
        async availability(request, { scope }) {
            const url = new URL(request.url);
            const eventTypeId = url.searchParams.get("event");
            const date = url.searchParams.get("date");
            const a = agenda();
            const et = a.eventType(scope, eventTypeId);
            if (!et)
                return json({ error: "unknown_event_type" }, 404);
            if (!date) {
                return json({
                    eventType: { id: et.id, title: et.title, durationMinutes: et.durationMinutes, location: et.location },
                    timezone: et.timezone,
                    days: a.listBookableDays(scope, et.id),
                });
            }
            const result = await a.getAvailability({ scope, eventTypeId: et.id, date });
            if (!result.ok)
                return json({ error: result.error }, 400);
            return json({ date: result.date, timezone: result.timezone, slots: result.slots });
        },
        /** `POST` a booking. 409 when the slot was taken meanwhile. */
        async book(request, { scope }) {
            const body = await readJson(request);
            if (!body)
                return json({ error: "invalid_json" }, 400);
            for (const field of required) {
                if (!str(body[field]).trim())
                    return json({ error: "missing_fields", field }, 400);
            }
            const extra = {};
            for (const [key, value] of Object.entries(body))
                if (!STANDARD_KEYS.has(key))
                    extra[key] = value;
            const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
                ? body.answers
                : undefined;
            const result = await agenda().createBooking({
                scope,
                eventTypeId: str(body.eventType) || "",
                startUtc: str(body.startUtc),
                guest: { name: str(body.name), email: str(body.email), phone: str(body.phone), timezone: str(body.timezone) },
                topic: str(body.topic),
                source: str(body.source),
                answers,
                extra,
            });
            if (!result.ok) {
                const status = result.error === "slot_taken" ? 409
                    : result.error === "unknown_event_type" ? 404
                        : result.error === "unconfigured" ? 503
                            : result.error === "db_error" ? 500
                                : 400;
                return json({ error: result.error, field: result.field }, status);
            }
            return json({
                ok: true,
                id: result.booking.id,
                startsAt: result.booking.startsAt,
                endsAt: result.booking.endsAt,
                location: result.booking.location,
                guestUrl: config.exposeGuestUrl ? result.guestUrl ?? undefined : undefined,
            });
        },
        /**
         * `POST { bookingId, token }` as a guest, or `POST { bookingId }` as
         * authenticated staff → `{ serverUrl, token, room, role }`.
         */
        async videoToken(request, { scope }) {
            const body = await readJson(request);
            const bookingId = str(body?.bookingId);
            if (!bookingId)
                return json({ error: "invalid_request" }, 400);
            const guestToken = str(body?.token);
            let result;
            if (guestToken) {
                result = await agenda().issueVideoAccess({ bookingId, as: "guest", manageToken: guestToken });
                if (result.ok && result.booking.scope !== scope)
                    return json({ error: "not_found" }, 404);
            }
            else {
                const who = await host(request, scope);
                if (!who)
                    return json({ error: "unauthorized" }, 401);
                result = await agenda().issueVideoAccess({ bookingId, as: "host", identity: who.identity, name: who.name, scope });
            }
            if (!result.ok) {
                const status = result.error === "forbidden" ? 403
                    : result.error === "not_found" ? 404
                        : result.error === "video_disabled" || result.error === "unconfigured" ? 503
                            : 409;
                return json({ error: result.error, opensAt: result.opensAt }, status);
            }
            return json({ serverUrl: result.serverUrl, token: result.token, room: result.room, role: result.role });
        },
        /** `POST { bookingId, token, reason? }` — the guest cancels their own booking. */
        async guestCancel(request, { scope }) {
            const body = await readJson(request);
            const bookingId = str(body?.bookingId);
            if (!bookingId)
                return json({ error: "invalid_request" }, 400);
            const result = await agenda().cancelBooking({
                id: bookingId,
                by: "guest",
                manageToken: str(body?.token),
                scope,
                reason: str(body?.reason),
            });
            if (!result.ok) {
                const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : result.error === "not_cancellable" ? 409 : 500;
                return json({ error: result.error }, status);
            }
            return json({ ok: true });
        },
        /** Staff: `GET ?from&to` lists bookings. */
        async hostList(request, { scope }) {
            if (!(await host(request, scope)))
                return json({ error: "unauthorized" }, 401);
            const url = new URL(request.url);
            const from = url.searchParams.get("from");
            const to = url.searchParams.get("to");
            if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
                return json({ error: "missing_range" }, 400);
            }
            const bookings = await agenda().listBookings({ scope, from, to });
            return json({ bookings: bookings.map(serializeBooking) });
        },
        /** Staff: `PATCH { id, action: "cancel" | "complete" | "no_show", reason? }`. */
        async hostUpdate(request, { scope }) {
            if (!(await host(request, scope)))
                return json({ error: "unauthorized" }, 401);
            const body = await readJson(request);
            const id = str(body?.id);
            const action = str(body?.action);
            if (!id || !action)
                return json({ error: "invalid_request" }, 400);
            if (action === "cancel") {
                const result = await agenda().cancelBooking({ id, by: "host", scope, reason: str(body?.reason) });
                if (!result.ok)
                    return json({ error: result.error }, result.error === "not_found" ? 404 : 409);
                return json({ ok: true, booking: serializeBooking(result.booking) });
            }
            const status = HOST_STATUS_ACTIONS[action];
            if (!status)
                return json({ error: "invalid_action" }, 400);
            const booking = await agenda().setStatus(id, status, scope);
            if (!booking)
                return json({ error: "not_found" }, 404);
            return json({ ok: true, booking: serializeBooking(booking) });
        },
        /** LiveKit webhook receiver. Needs the raw body, so mount it on its own route. */
        async livekitWebhook(request) {
            const raw = await request.text();
            const result = await agenda().handleLivekitWebhook(raw, request.headers.get("authorization"));
            if (!result.ok)
                return json({ error: result.error }, result.error === "unauthorized" ? 401 : 503);
            return json({ ok: true });
        },
    };
}
//# sourceMappingURL=handlers.js.map