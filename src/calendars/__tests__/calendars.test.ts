import { describe, expect, it } from "vitest";

import { caldavBusy, discoverCalendars } from "../caldav.js";
import { decryptJson, encryptJson, signState, verifyState } from "../crypto.js";
import { googleBusy } from "../google.js";
import { busyFromIcs } from "../ical.js";
import { microsoftBusy } from "../microsoft.js";
import { authorizationUrl, freshCredentials } from "../oauth.js";

const from = new Date("2026-10-05T00:00:00Z");
const to = new Date("2026-10-12T00:00:00Z");

describe("crypto", () => {
  it("round-trips credentials and rejects another key", () => {
    const sealed = encryptJson("k".repeat(40), { a: 1 });
    expect(decryptJson("k".repeat(40), sealed)).toEqual({ a: 1 });
    expect(() => decryptJson("x".repeat(40), sealed)).toThrow();
  });

  it("signs OAuth state and refuses tampering", () => {
    const token = signState("secret-secret-secret", { scope: "s", hostId: "h", provider: "google", returnTo: "/x" });
    expect(verifyState("secret-secret-secret", token)).toEqual({ scope: "s", hostId: "h", provider: "google", returnTo: "/x" });
    expect(verifyState("secret-secret-secret", token.replace(/^./, "A"))).toBeNull();
    expect(verifyState("other-secret-secret", token)).toBeNull();
  });
});

describe("ical", () => {
  it("expands recurrences, applies exceptions and skips free or cancelled events", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Rome",
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "DTSTART:19700329T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "DTSTART:19701025T030000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:daily",
      "DTSTART;TZID=Europe/Rome:20261001T100000",
      "DTEND;TZID=Europe/Rome:20261001T103000",
      "RRULE:FREQ=DAILY;COUNT=10",
      "EXDATE;TZID=Europe/Rome:20261006T100000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:daily",
      "RECURRENCE-ID;TZID=Europe/Rome:20261007T100000",
      "DTSTART;TZID=Europe/Rome:20261007T150000",
      "DTEND;TZID=Europe/Rome:20261007T160000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:free",
      "DTSTART:20261005T120000Z",
      "DTEND:20261005T130000Z",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:cancelled",
      "DTSTART:20261005T140000Z",
      "DTEND:20261005T150000Z",
      "STATUS:CANCELLED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const busy = busyFromIcs(ics, from, to).map((b) => b.start.toISOString()).sort();
    expect(busy).toContain("2026-10-05T08:00:00.000Z");
    expect(busy).not.toContain("2026-10-06T08:00:00.000Z");
    expect(busy).toContain("2026-10-07T13:00:00.000Z");
    expect(busy).not.toContain("2026-10-07T08:00:00.000Z");
    expect(busy).not.toContain("2026-10-05T12:00:00.000Z");
    expect(busy).not.toContain("2026-10-05T14:00:00.000Z");
    expect(busy.length).toBe(5); // 5th, 7th (moved), 8th, 9th, 10th
  });
});

describe("providers", () => {
  it("reads Google free/busy", async () => {
    const calls: RequestInit[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return Response.json({ calendars: { primary: { busy: [{ start: "2026-10-05T08:00:00Z", end: "2026-10-05T09:00:00Z" }] } } });
    }) as unknown as typeof fetch;
    const busy = await googleBusy("tok", from, to, fake);
    expect(busy[0].start.toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect((calls[0].headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("reads Microsoft calendarView across pages and skips free events", async () => {
    const pages = [
      { value: [{ start: { dateTime: "2026-10-05T08:00:00.0000000" }, end: { dateTime: "2026-10-05T09:00:00.0000000" }, showAs: "busy" }], "@odata.nextLink": "https://graph.example/next" },
      { value: [{ start: { dateTime: "2026-10-06T08:00:00.0000000" }, end: { dateTime: "2026-10-06T09:00:00.0000000" }, showAs: "free" }] },
    ];
    let i = 0;
    const fake = (async () => Response.json(pages[i++])) as unknown as typeof fetch;
    const busy = await microsoftBusy("tok", from, to, fake);
    expect(busy).toHaveLength(1);
    expect(busy[0].end.toISOString()).toBe("2026-10-05T09:00:00.000Z");
  });

  it("refreshes an expired OAuth token", async () => {
    const fake = (async () => Response.json({ access_token: "new", expires_in: 3600 })) as unknown as typeof fetch;
    const cfg = { credentialsKey: "k".repeat(40), redirectUri: () => "https://x/cb", google: { clientId: "id", clientSecret: "s" }, fetch: fake };
    const fresh = await freshCredentials(cfg, "google", { accessToken: "old", refreshToken: "r", expiresAt: 0 });
    expect(fresh).toMatchObject({ accessToken: "new", refreshToken: "r" });
    const url = new URL(authorizationUrl(cfg, "google", "st"));
    expect(url.searchParams.get("scope")).toContain("calendar.freebusy");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("discovers iCloud-style CalDAV calendars and queries them", async () => {
    const ms = (body: string) => new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">${body}</d:multistatus>`, { status: 207 });
    const fake = (async (url: string, init: RequestInit) => {
      const body = String(init.body);
      if (body.includes("current-user-principal")) return ms(`<d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response>`);
      if (body.includes("calendar-home-set")) return ms(`<d:response><d:href>/123/principal/</d:href><d:propstat><d:prop><cal:calendar-home-set><d:href>https://p01-caldav.example.test/123/calendars/</d:href></cal:calendar-home-set></d:prop></d:propstat></d:response>`);
      if (body.includes("supported-calendar-component-set")) {
        return ms(
          `<d:response><d:href>/123/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>` +
            `<d:response><d:href>/123/calendars/home/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set></d:prop></d:propstat></d:response>` +
            `<d:response><d:href>/123/calendars/tasks/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></d:prop></d:propstat></d:response>`,
        );
      }
      expect(url).toBe("https://p01-caldav.example.test/123/calendars/home/");
      return ms(`<d:response><d:href>/123/calendars/home/e.ics</d:href><d:propstat><d:prop><cal:calendar-data>BEGIN:VCALENDAR&#13;
BEGIN:VEVENT&#13;
UID:e&#13;
DTSTART:20261005T080000Z&#13;
DTEND:20261005T090000Z&#13;
END:VEVENT&#13;
END:VCALENDAR</cal:calendar-data></d:prop></d:propstat></d:response>`);
    }) as unknown as typeof fetch;
    const creds = { server: "https://caldav.example.test", username: "me@icloud.com", password: "app-pass" };
    expect(await discoverCalendars(creds, fake)).toEqual(["https://p01-caldav.example.test/123/calendars/home/"]);
    const result = await caldavBusy(creds, from, to, fake);
    expect(result.busy.map((b) => b.start.toISOString())).toEqual(["2026-10-05T08:00:00.000Z"]);
    expect(result.credentials?.calendars).toHaveLength(1);
  });
});
