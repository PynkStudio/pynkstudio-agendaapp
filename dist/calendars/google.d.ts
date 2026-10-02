import type { BusyInterval } from "../core/types.js";
import { type HostEvent, type WritableCalendar } from "./types.js";
/** Busy times of the account's primary calendar (FreeBusy API, scope calendar.freebusy). */
export declare function googleBusy(accessToken: string, from: Date, to: Date, fetchImpl?: typeof fetch): Promise<BusyInterval[]>;
export declare function googleCalendars(token: string, fetchImpl?: typeof fetch): Promise<WritableCalendar[]>;
export declare function googleCreateEvent(token: string, calendarId: string, e: HostEvent, fetchImpl?: typeof fetch): Promise<string>;
export declare function googleDeleteEvent(token: string, calendarId: string, eventId: string, fetchImpl?: typeof fetch): Promise<void>;
//# sourceMappingURL=google.d.ts.map