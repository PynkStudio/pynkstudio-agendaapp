import { CalendarAuthError } from "./types.js";
/** Busy times of the account's primary calendar (FreeBusy API, scope calendar.freebusy). */
export async function googleBusy(accessToken, from, to, fetchImpl = fetch) {
    const res = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] }),
    });
    if (res.status === 401 || res.status === 403)
        throw new CalendarAuthError(`Google refused access (${res.status})`);
    if (!res.ok)
        throw new Error(`Google freeBusy failed (${res.status})`);
    const data = (await res.json());
    const primary = data.calendars?.primary;
    if (primary?.errors?.length)
        throw new Error(`Google freeBusy error: ${JSON.stringify(primary.errors)}`);
    return (primary?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}
const API = "https://www.googleapis.com/calendar/v3";
async function google(token, path, init, fetchImpl) {
    const res = await fetchImpl(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
    if (res.status === 401 || res.status === 403)
        throw new CalendarAuthError(`Google refused access (${res.status})`);
    // An event already gone is not an error when deleting.
    if (res.status === 404 || res.status === 410)
        return null;
    if (!res.ok)
        throw new Error(`Google ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status})`);
    return res.status === 204 ? null : (await res.json());
}
export async function googleCalendars(token, fetchImpl = fetch) {
    const data = await google(token, "/users/me/calendarList?minAccessRole=writer", {}, fetchImpl);
    return (data?.items ?? []).map((c) => ({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, primary: Boolean(c.primary) }));
}
export async function googleCreateEvent(token, calendarId, e, fetchImpl = fetch) {
    const created = await google(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify({
            summary: e.title,
            description: e.description,
            location: e.location,
            start: { dateTime: e.start.toISOString() },
            end: { dateTime: e.end.toISOString() },
            iCalUID: e.uid,
        }),
    }, fetchImpl);
    if (!created?.id)
        throw new Error("Google did not return the event id");
    return created.id;
}
export async function googleDeleteEvent(token, calendarId, eventId, fetchImpl = fetch) {
    await google(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }, fetchImpl);
}
//# sourceMappingURL=google.js.map