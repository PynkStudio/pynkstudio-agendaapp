/**
 * Web-standard `(Request) => Response` handlers. They work as Next.js route
 * handlers and in any fetch-based runtime. The host resolves the scope (which
 * tenant or project the request is for) and authenticates its own staff;
 * everything else is here.
 */
import { HOLIDAY_CALENDARS } from "../core/holidays.js";
import { eventIcs } from "../core/ics.js";
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
        hostId: b.hostId,
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
            const et = await a.eventType(scope, eventTypeId);
            if (!et)
                return json({ error: "unknown_event_type" }, 404);
            if (!date) {
                return json({
                    eventType: { id: et.id, title: et.title, durationMinutes: et.durationMinutes, location: et.location },
                    timezone: et.timezone,
                    days: await a.listBookableDays(scope, et.id),
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
            return json({
                serverUrl: result.serverUrl,
                token: result.token,
                room: result.room,
                role: result.role,
                displayName: result.displayName,
            });
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
        /**
         * Staff — settings page data: `GET` → `{ eventTypes, hosts, connections, providers, holidayCalendars }`.
         */
        async settingsGet(request, { scope }) {
            if (!(await host(request, scope)))
                return json({ error: "unauthorized" }, 401);
            const a = agenda();
            const hosts = config.listStaff ? await a.settings.syncHosts(scope, await config.listStaff(scope)) : await a.settings.hosts(scope);
            const [eventTypes, connections] = await Promise.all([a.settings.eventTypes(scope), a.calendars.list(scope)]);
            return json({
                eventTypes,
                hosts,
                connections,
                providers: a.calendars.providers(),
                holidayCalendars: Object.entries(HOLIDAY_CALENDARS).map(([code, c]) => ({ code, label: c.label })),
            });
        },
        /**
         * Staff — `PUT { id, ...fields }` saves an event type's settings;
         * `PUT { id, reset: true }` goes back to the code default.
         */
        async settingsSaveEventType(request, { scope }) {
            if (!(await host(request, scope)))
                return json({ error: "unauthorized" }, 401);
            const body = await readJson(request);
            const id = str(body?.id);
            if (!body || !id)
                return json({ error: "invalid_request" }, 400);
            const a = agenda();
            if (body.reset === true) {
                await a.settings.resetEventType(scope, id);
                return json({ ok: true, eventType: await a.eventType(scope, id) });
            }
            const result = await a.settings.saveEventType(scope, id, body);
            if ("error" in result)
                return json({ error: result.error }, result.error === "unknown_event_type" ? 404 : 400);
            return json({ ok: true, eventType: result });
        },
        /** Staff — `PATCH { hostId, active?, weekly? }` (weekly `null` = same hours as the event type). */
        async settingsUpdateHost(request, { scope }) {
            if (!(await host(request, scope)))
                return json({ error: "unauthorized" }, 401);
            const body = await readJson(request);
            const hostId = str(body?.hostId);
            if (!body || !hostId)
                return json({ error: "invalid_request" }, 400);
            let writeTarget;
            if (body.writeTarget === null)
                writeTarget = null;
            else if (body.writeTarget && typeof body.writeTarget === "object") {
                const t = body.writeTarget;
                const connectionId = str(t.connectionId);
                const calendarId = str(t.calendarId);
                // Only one of this person's own calendars that accepts writing.
                const own = (await agenda().calendars.list(scope, hostId)).find((c) => c.id === connectionId);
                if (!own || !calendarId || !agenda().calendars.writable(own.provider))
                    return json({ error: "invalid_write_target" }, 400);
                writeTarget = { connectionId, calendarId, calendarName: str(t.calendarName) || null };
            }
            const updated = await agenda().settings.updateHost(scope, hostId, {
                active: body.active,
                weekly: body.weekly,
                writeTarget,
            });
            return updated ? json({ ok: true, host: updated }) : json({ error: "not_found" }, 404);
        },
        /**
         * Staff — `GET ?connectionId` lists the calendars that can receive bookings;
         * `POST { hostId, provider: "caldav", username, password, server? }`
         * or `{ hostId, provider: "ics", url, label? }` connects a calendar;
         * `DELETE { id }` disconnects one.
         */
        async calendarsManage(request, { scope }) {
            if (!(await host(request, scope)))
                return json({ error: "unauthorized" }, 401);
            const calendars = agenda().calendars;
            if (request.method === "GET") {
                // `GET ?connectionId` → calendars of that connection that can receive the bookings.
                const connectionId = new URL(request.url).searchParams.get("connectionId") ?? "";
                const result = await calendars.writableCalendars(scope, connectionId);
                return Array.isArray(result) ? json({ calendars: result }) : json({ error: result.error }, result.error === "not_found" ? 404 : 400);
            }
            const body = await readJson(request);
            if (request.method === "DELETE") {
                const id = str(body?.id);
                if (!id)
                    return json({ error: "invalid_request" }, 400);
                return (await calendars.remove(scope, id)) ? json({ ok: true }) : json({ error: "db_error" }, 500);
            }
            const hostId = str(body?.hostId);
            const provider = str(body?.provider);
            if (!hostId || !calendars.enabled())
                return json({ error: hostId ? "calendars_disabled" : "invalid_request" }, hostId ? 503 : 400);
            const hosts = await agenda().settings.hosts(scope);
            if (!hosts.some((h) => h.id === hostId))
                return json({ error: "unknown_host" }, 404);
            const result = provider === "caldav"
                ? await calendars.connectCalDav(scope, hostId, { server: str(body?.server), username: str(body?.username), password: str(body?.password) })
                : provider === "ics"
                    ? await calendars.connectIcs(scope, hostId, { url: str(body?.url), label: str(body?.label) })
                    : { ok: false, error: "unsupported_provider" };
            return result.ok ? json({ ok: true, connection: result.connection }) : json({ error: result.error }, 400);
        },
        /** Staff — `GET ?hostId&provider=google|microsoft&returnTo` → redirect to the provider's consent screen. */
        async calendarOAuthStart(request, { scope }) {
            if (!(await host(request, scope)))
                return json({ error: "unauthorized" }, 401);
            const url = new URL(request.url);
            const provider = url.searchParams.get("provider");
            const hostId = url.searchParams.get("hostId") ?? "";
            if (provider !== "google" && provider !== "microsoft")
                return json({ error: "unsupported_provider" }, 400);
            const calendars = agenda().calendars;
            if (!calendars.providers()[provider])
                return json({ error: "provider_not_configured" }, 503);
            const hosts = await agenda().settings.hosts(scope);
            if (!hosts.some((h) => h.id === hostId))
                return json({ error: "unknown_host" }, 404);
            // Only same-origin paths: the callback must not become an open redirect.
            const returnTo = url.searchParams.get("returnTo") ?? "/";
            const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
            return Response.redirect(calendars.startOAuth(scope, hostId, provider, safeReturn), 302);
        },
        /** OAuth callback for a provider: stores the connection, then redirects to `returnTo?calendar=connected|error`. */
        async calendarOAuthCallback(request, provider) {
            const url = new URL(request.url);
            const result = await agenda().calendars.finishOAuth(provider, url.searchParams.get("code"), url.searchParams.get("state"));
            const back = new URL(result.returnTo ?? "/", url.origin);
            back.searchParams.set("calendar", result.ok ? "connected" : "error");
            if (!result.ok)
                back.searchParams.set("reason", result.error);
            return Response.redirect(back.toString(), 303);
        },
        /**
         * Guest — `GET ?bookingId&token` → the booking as an `.ics` file
         * ("save to calendar", Apple Calendar and anything else that opens iCal).
         */
        async guestIcs(request, { scope }) {
            const url = new URL(request.url);
            const bookingId = url.searchParams.get("bookingId") ?? "";
            const token = url.searchParams.get("token") ?? "";
            const a = agenda();
            if (!a.verifyManageToken(bookingId, token))
                return json({ error: "forbidden" }, 403);
            const booking = await a.getBooking(bookingId);
            if (!booking || booking.scope !== scope)
                return json({ error: "not_found" }, 404);
            const ics = eventIcs({ ...(await a.guestCalendarEvent(booking)), status: booking.status === "cancelled" ? "CANCELLED" : "CONFIRMED" });
            return new Response(ics, {
                headers: {
                    "Content-Type": "text/calendar; charset=utf-8",
                    "Content-Disposition": 'attachment; filename="appointment.ics"',
                    "Cache-Control": "no-store",
                    "Referrer-Policy": "no-referrer",
                },
            });
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