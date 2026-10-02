import type { BusyInterval } from "../core/types.js";
import { type HostEvent, type WritableCalendar } from "./types.js";
/** Busy times of the default Outlook / Microsoft 365 calendar (Graph calendarView, UTC). */
export declare function microsoftBusy(accessToken: string, from: Date, to: Date, fetchImpl?: typeof fetch): Promise<BusyInterval[]>;
export declare function microsoftCalendars(token: string, fetchImpl?: typeof fetch): Promise<WritableCalendar[]>;
export declare function microsoftCreateEvent(token: string, calendarId: string, e: HostEvent, fetchImpl?: typeof fetch): Promise<string>;
export declare function microsoftDeleteEvent(token: string, eventId: string, fetchImpl?: typeof fetch): Promise<void>;
//# sourceMappingURL=microsoft.d.ts.map