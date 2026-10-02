import { CalendarAuthError } from "./types.js";
/** Busy times of the default Outlook / Microsoft 365 calendar (Graph calendarView, UTC). */
export async function microsoftBusy(accessToken, from, to, fetchImpl = fetch) {
    const out = [];
    let url = `https://graph.microsoft.com/v1.0/me/calendarView?${new URLSearchParams({
        startDateTime: from.toISOString(),
        endDateTime: to.toISOString(),
        $select: "start,end,showAs,isCancelled",
        $top: "250",
    })}`;
    for (let page = 0; url && page < 20; page++) {
        const res = await fetchImpl(url, {
            headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
        });
        if (res.status === 401 || res.status === 403)
            throw new CalendarAuthError(`Microsoft refused access (${res.status})`);
        if (!res.ok)
            throw new Error(`Microsoft calendarView failed (${res.status})`);
        const data = (await res.json());
        for (const e of data.value ?? []) {
            if (e.isCancelled || (e.showAs ?? "busy").toLowerCase() === "free")
                continue;
            // With the UTC preference Graph returns UTC wall time without an offset.
            out.push({ start: new Date(`${e.start.dateTime.replace(/Z$/, "")}Z`), end: new Date(`${e.end.dateTime.replace(/Z$/, "")}Z`) });
        }
        url = data["@odata.nextLink"] ?? null;
    }
    return out;
}
const GRAPH = "https://graph.microsoft.com/v1.0";
async function graph(token, path, init, fetchImpl) {
    const res = await fetchImpl(`${GRAPH}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
    if (res.status === 401 || res.status === 403)
        throw new CalendarAuthError(`Microsoft refused access (${res.status})`);
    if (res.status === 404)
        return null;
    if (!res.ok)
        throw new Error(`Microsoft ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status})`);
    return res.status === 204 ? null : (await res.json());
}
export async function microsoftCalendars(token, fetchImpl = fetch) {
    const data = await graph(token, "/me/calendars?$select=id,name,canEdit,isDefaultCalendar&$top=100", {}, fetchImpl);
    return (data?.value ?? []).filter((c) => c.canEdit !== false).map((c) => ({ id: c.id, name: c.name, primary: Boolean(c.isDefaultCalendar) }));
}
export async function microsoftCreateEvent(token, calendarId, e, fetchImpl = fetch) {
    const created = await graph(token, `/me/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify({
            subject: e.title,
            body: { contentType: "text", content: e.description ?? "" },
            start: { dateTime: e.start.toISOString().replace("Z", ""), timeZone: "UTC" },
            end: { dateTime: e.end.toISOString().replace("Z", ""), timeZone: "UTC" },
            ...(e.location ? { location: { displayName: e.location } } : {}),
            transactionId: e.uid,
        }),
    }, fetchImpl);
    if (!created?.id)
        throw new Error("Microsoft did not return the event id");
    return created.id;
}
export async function microsoftDeleteEvent(token, eventId, fetchImpl = fetch) {
    await graph(token, `/me/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }, fetchImpl);
}
//# sourceMappingURL=microsoft.js.map