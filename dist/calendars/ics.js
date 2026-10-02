import { busyFromIcs } from "./ical.js";
export function normalizeIcsUrl(url) {
    const trimmed = url.trim().replace(/^webcals?:\/\//i, "https://");
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        throw new Error("ICS link must be http(s)");
    return parsed.toString();
}
/** Busy times from a published calendar feed (Google secret address, Outlook "publish", iCloud public link…). */
export async function icsBusy(url, from, to, fetchImpl = fetch) {
    const res = await fetchImpl(normalizeIcsUrl(url), { headers: { Accept: "text/calendar, */*" } });
    if (!res.ok)
        throw new Error(`calendar feed returned ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR"))
        throw new Error("the link is not an iCalendar feed");
    return busyFromIcs(text, from, to);
}
//# sourceMappingURL=ics.js.map