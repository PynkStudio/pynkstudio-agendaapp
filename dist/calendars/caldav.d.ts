import type { BusyInterval } from "../core/types.js";
import { type CalDavCredentials, type HostEvent, type WritableCalendar } from "./types.js";
export declare const ICLOUD_CALDAV = "https://caldav.icloud.com";
/** Finds the event calendars of the account: principal → calendar home → collections. */
export declare function discoverCalendars(creds: CalDavCredentials, fetchImpl?: typeof fetch): Promise<string[]>;
/** Same as discoverCalendars, with display names: the destination picker shows them. */
export declare function discoverNamedCalendars(creds: CalDavCredentials, fetchImpl?: typeof fetch): Promise<WritableCalendar[]>;
/** Writes the event as `<uid>.ics` in the chosen calendar collection. Returns the resource URL. */
export declare function caldavPutEvent(creds: CalDavCredentials, calendarUrl: string, e: HostEvent, fetchImpl?: typeof fetch): Promise<string>;
export declare function caldavDeleteEvent(creds: CalDavCredentials, eventUrlValue: string, fetchImpl?: typeof fetch): Promise<void>;
/** Busy times across the account's event calendars. Returns refreshed credentials when discovery ran. */
export declare function caldavBusy(creds: CalDavCredentials, from: Date, to: Date, fetchImpl?: typeof fetch): Promise<{
    busy: BusyInterval[];
    credentials?: CalDavCredentials;
}>;
//# sourceMappingURL=caldav.d.ts.map