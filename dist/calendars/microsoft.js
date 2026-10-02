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
//# sourceMappingURL=microsoft.js.map