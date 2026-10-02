// Dev-only backend for the settings playground: the real server and handlers
// on top of the in-memory database used by the tests.
import { createAgendaHandlers } from "../src/http/handlers";
import { createAgendaServer } from "../src/server/agenda";
import { createFakeDb } from "../src/server/__tests__/fake-db";

const db = createFakeDb();

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
