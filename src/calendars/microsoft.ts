import type { BusyInterval } from "../core/types.js";
import { CalendarAuthError } from "./types.js";

type GraphEvent = { start: { dateTime: string }; end: { dateTime: string }; showAs?: string; isCancelled?: boolean };

/** Busy times of the default Outlook / Microsoft 365 calendar (Graph calendarView, UTC). */
export async function microsoftBusy(accessToken: string, from: Date, to: Date, fetchImpl: typeof fetch = fetch): Promise<BusyInterval[]> {
  const out: BusyInterval[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/me/calendarView?${new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime: to.toISOString(),
      $select: "start,end,showAs,isCancelled",
      $top: "250",
    })}`;
  for (let page = 0; url && page < 20; page++) {
    const res: Response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    });
    if (res.status === 401 || res.status === 403) throw new CalendarAuthError(`Microsoft refused access (${res.status})`);
    if (!res.ok) throw new Error(`Microsoft calendarView failed (${res.status})`);
    const data = (await res.json()) as { value?: GraphEvent[]; "@odata.nextLink"?: string };
    for (const e of data.value ?? []) {
      if (e.isCancelled || (e.showAs ?? "busy").toLowerCase() === "free") continue;
      // With the UTC preference Graph returns UTC wall time without an offset.
      out.push({ start: new Date(`${e.start.dateTime.replace(/Z$/, "")}Z`), end: new Date(`${e.end.dateTime.replace(/Z$/, "")}Z`) });
    }
    url = data["@odata.nextLink"] ?? null;
  }
  return out;
}
