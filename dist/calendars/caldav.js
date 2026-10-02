import { busyFromIcs } from "./ical.js";
import { eventIcs } from "../core/ics.js";
import { CalendarAuthError } from "./types.js";
export const ICLOUD_CALDAV = "https://caldav.icloud.com";
const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"';
function decodeXml(text) {
    return text
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#13;/g, "\r")
        .replace(/&#10;/g, "\n")
        .replace(/&amp;/g, "&");
}
/** `<response>` blocks of a multistatus body, whatever the namespace prefix. */
function responses(xml) {
    return xml.split(/<(?:[\w-]+:)?response[\s>]/i).slice(1);
}
function firstHref(xml) {
    const m = /<(?:[\w-]+:)?href[^>]*>([^<]+)</i.exec(xml);
    return m ? decodeXml(m[1].trim()) : null;
}
function hrefInside(xml, element) {
    const m = new RegExp(`<(?:[\\w-]+:)?${element}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${element}>`, "i").exec(xml);
    return m ? firstHref(m[1]) : null;
}
function utcStamp(d) {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function authHeader(creds) {
    return { Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString("base64")}` };
}
async function dav(creds, url, method, depth, body, fetchImpl) {
    const res = await fetchImpl(url, {
        method,
        headers: { ...authHeader(creds), Depth: depth, "Content-Type": "application/xml; charset=utf-8" },
        body,
    });
    if (res.status === 401 || res.status === 403)
        throw new CalendarAuthError("CalDAV credentials refused (use an app-specific password)");
    if (res.status !== 207 && !res.ok)
        throw new Error(`CalDAV ${method} failed (${res.status})`);
    return res.text();
}
/** Finds the event calendars of the account: principal → calendar home → collections. */
export async function discoverCalendars(creds, fetchImpl = fetch) {
    return (await discoverNamedCalendars(creds, fetchImpl)).map((c) => c.id);
}
/** Same as discoverCalendars, with display names: the destination picker shows them. */
export async function discoverNamedCalendars(creds, fetchImpl = fetch) {
    const root = creds.server.replace(/\/+$/, "") + "/";
    const principalXml = await dav(creds, root, "PROPFIND", "0", `<d:propfind ${NS}><d:prop><d:current-user-principal/></d:prop></d:propfind>`, fetchImpl);
    const principal = hrefInside(principalXml, "current-user-principal");
    if (!principal)
        throw new Error("CalDAV: no principal found");
    const principalUrl = new URL(principal, root).toString();
    const homeXml = await dav(creds, principalUrl, "PROPFIND", "0", `<d:propfind ${NS}><d:prop><c:calendar-home-set/></d:prop></d:propfind>`, fetchImpl);
    const home = hrefInside(homeXml, "calendar-home-set");
    if (!home)
        throw new Error("CalDAV: no calendar home found");
    const homeUrl = new URL(home, principalUrl).toString();
    const listXml = await dav(creds, homeUrl, "PROPFIND", "1", `<d:propfind ${NS}><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>`, fetchImpl);
    const calendars = [];
    for (const r of responses(listXml)) {
        const type = /<(?:[\w-]+:)?resourcetype[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?resourcetype>/i.exec(r)?.[1] ?? "";
        if (!/<(?:[\w-]+:)?calendar[\s/>]/i.test(type))
            continue;
        const comps = /<(?:[\w-]+:)?supported-calendar-component-set[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?supported-calendar-component-set>/i.exec(r)?.[1];
        if (comps && !/name="VEVENT"/i.test(comps))
            continue;
        const href = firstHref(r);
        if (!href)
            continue;
        const name = /<(?:[\w-]+:)?displayname[^>]*>([^<]*)</i.exec(r)?.[1];
        const id = new URL(href, homeUrl).toString();
        calendars.push({ id, name: name ? decodeXml(name.trim()) : decodeURIComponent(id.split("/").filter(Boolean).pop() ?? id) });
    }
    return calendars;
}
function eventUrl(calendarUrl, uid) {
    return `${calendarUrl.replace(/\/?$/, "/")}${encodeURIComponent(uid)}.ics`;
}
/** Writes the event as `<uid>.ics` in the chosen calendar collection. Returns the resource URL. */
export async function caldavPutEvent(creds, calendarUrl, e, fetchImpl = fetch) {
    const url = eventUrl(calendarUrl, e.uid);
    const res = await fetchImpl(url, {
        method: "PUT",
        headers: { ...authHeader(creds), "Content-Type": "text/calendar; charset=utf-8" },
        body: eventIcs({ uid: e.uid, start: e.start, end: e.end, title: e.title, description: e.description, location: e.location }).replace("METHOD:PUBLISH\r\n", ""),
    });
    if (res.status === 401 || res.status === 403)
        throw new CalendarAuthError("CalDAV credentials refused");
    if (!res.ok)
        throw new Error(`CalDAV PUT failed (${res.status})`);
    return url;
}
export async function caldavDeleteEvent(creds, eventUrlValue, fetchImpl = fetch) {
    const res = await fetchImpl(eventUrlValue, { method: "DELETE", headers: authHeader(creds) });
    if (res.status === 401 || res.status === 403)
        throw new CalendarAuthError("CalDAV credentials refused");
    if (!res.ok && res.status !== 404 && res.status !== 410)
        throw new Error(`CalDAV DELETE failed (${res.status})`);
}
/** Busy times across the account's event calendars. Returns refreshed credentials when discovery ran. */
export async function caldavBusy(creds, from, to, fetchImpl = fetch) {
    let calendars = creds.calendars;
    let updated;
    if (!calendars?.length) {
        calendars = await discoverCalendars(creds, fetchImpl);
        updated = { ...creds, calendars };
    }
    const query = `<c:calendar-query ${NS}><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${utcStamp(from)}" end="${utcStamp(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
    const busy = [];
    for (const url of calendars) {
        const xml = await dav(creds, url, "REPORT", "1", query, fetchImpl);
        const re = /<(?:[\w-]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?calendar-data>/gi;
        for (let m = re.exec(xml); m; m = re.exec(xml)) {
            busy.push(...busyFromIcs(decodeXml(m[1]).trim(), from, to));
        }
    }
    return { busy, credentials: updated };
}
//# sourceMappingURL=caldav.js.map