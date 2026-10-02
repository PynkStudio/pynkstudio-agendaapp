import type { BusyInterval } from "../core/types.js";
import { type CalDavCredentials } from "./types.js";
export declare const ICLOUD_CALDAV = "https://caldav.icloud.com";
/** Finds the event calendars of the account: principal → calendar home → collections. */
export declare function discoverCalendars(creds: CalDavCredentials, fetchImpl?: typeof fetch): Promise<string[]>;
/** Busy times across the account's event calendars. Returns refreshed credentials when discovery ran. */
export declare function caldavBusy(creds: CalDavCredentials, from: Date, to: Date, fetchImpl?: typeof fetch): Promise<{
    busy: BusyInterval[];
    credentials?: CalDavCredentials;
}>;
//# sourceMappingURL=caldav.d.ts.map