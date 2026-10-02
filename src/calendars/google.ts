import type { BusyInterval } from "../core/types.js";
import { CalendarAuthError, type HostEvent, type WritableCalendar } from "./types.js";

/** Busy times of the account's primary calendar (FreeBusy API, scope calendar.freebusy). */
export async function googleBusy(accessToken: string, from: Date, to: Date, fetchImpl: typeof fetch = fetch): Promise<BusyInterval[]> {
  const res = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] }),
  });
  if (res.status === 401 || res.status === 403) throw new CalendarAuthError(`Google refused access (${res.status})`);
  if (!res.ok) throw new Error(`Google freeBusy failed (${res.status})`);
  const data = (await res.json()) as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }> };
  const primary = data.calendars?.primary;
  if (primary?.errors?.length) throw new Error(`Google freeBusy error: ${JSON.stringify(primary.errors)}`);
  return (primary?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

const API = "https://www.googleapis.com/calendar/v3";

async function google<T>(token: string, path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T | null> {
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 401 || res.status === 403) throw new CalendarAuthError(`Google refused access (${res.status})`);
  // An event already gone is not an error when deleting.
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`Google ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status})`);
  return res.status === 204 ? null : ((await res.json()) as T);
}

export async function googleCalendars(token: string, fetchImpl: typeof fetch = fetch): Promise<WritableCalendar[]> {
  const data = await google<{ items?: Array<{ id: string; summary?: string; summaryOverride?: string; primary?: boolean }> }>(
    token,
    "/users/me/calendarList?minAccessRole=writer",
    {},
    fetchImpl,
  );
  return (data?.items ?? []).map((c) => ({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, primary: Boolean(c.primary) }));
}

export async function googleCreateEvent(token: string, calendarId: string, e: HostEvent, fetchImpl: typeof fetch = fetch): Promise<string> {
  const created = await google<{ id: string }>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: e.title,
        description: e.description,
        location: e.location,
        start: { dateTime: e.start.toISOString() },
        end: { dateTime: e.end.toISOString() },
        iCalUID: e.uid,
      }),
    },
    fetchImpl,
  );
  if (!created?.id) throw new Error("Google did not return the event id");
  return created.id;
}

export async function googleDeleteEvent(token: string, calendarId: string, eventId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await google(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }, fetchImpl);
}
