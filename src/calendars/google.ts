import type { BusyInterval } from "../core/types.js";
import { CalendarAuthError } from "./types.js";

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
