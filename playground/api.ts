// Dev-only backend for the settings playground: the real server and handlers
// on top of the in-memory database used by the tests.
import { createAgendaHandlers } from "../src/http/handlers";
import { createAgendaServer } from "../src/server/agenda";
import { createFakeDb } from "../src/server/__tests__/fake-db";

const db = createFakeDb();

// Simulated CalDAV account (any credentials) with two calendars, so the
// connect and destination flows can be tried without a real iCloud.
const ms = (body: string) =>
  new Response(`<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">${body}</d:multistatus>`, { status: 207 });
const fakeCalDav = (async (url: string, init?: RequestInit) => {
  const body = String(init?.body ?? "");
  if (init?.method === "PUT" || init?.method === "DELETE") return new Response(null, { status: 201 });
  if (body.includes("current-user-principal")) return ms(`<d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/1/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response>`);
  if (body.includes("calendar-home-set")) return ms(`<d:response><d:href>/1/principal/</d:href><d:propstat><d:prop><cal:calendar-home-set><d:href>/1/calendars/</d:href></cal:calendar-home-set></d:prop></d:propstat></d:response>`);
  if (body.includes("supported-calendar-component-set")) {
    const cal = (id: string, name: string) =>
      `<d:response><d:href>/1/calendars/${id}/</d:href><d:propstat><d:prop><d:displayname>${name}</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype></d:prop></d:propstat></d:response>`;
    return ms(cal("work", "Lavoro") + cal("home", "Personale"));
  }
  return ms("");
}) as unknown as typeof fetch;

export const agenda = createAgendaServer({
  db: () => db,
  signingSecret: "playground-signing-secret",
  eventTypes: [
    {
      id: "intro-30",
      title: "Intro call",
      durationMinutes: 30,
      timezone: "Europe/Rome",
      weekly: [1, 2, 3, 4, 5].map((day) => ({ day: day as 1, start: "09:00", end: "13:00" })),
      lookaheadDays: 14,
      location: "video",
    },
  ],
  calendars: {
    credentialsKey: "playground-credentials-key-0123456789",
    redirectUri: (p) => `http://localhost:5180/api/oauth/${p}`,
    google: { clientId: "playground", clientSecret: "playground" },
    fetch: (async (url: string, init?: RequestInit) =>
      String(url).startsWith("https://accounts.google.com") ? fetch(url, init) : fakeCalDav(url, init)) as unknown as typeof fetch,
  },
});

export const http = createAgendaHandlers({
  agenda,
  authorizeHost: () => ({ identity: "dev", name: "Dev" }),
  listStaff: async () => [
    { externalId: "u1", name: "Ada Lovelace", email: "ada@example.com" },
    { externalId: "u2", name: "Alan Turing", email: "alan@example.com" },
  ],
});
