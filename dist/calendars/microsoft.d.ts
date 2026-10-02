import type { BusyInterval } from "../core/types.js";
/** Busy times of the default Outlook / Microsoft 365 calendar (Graph calendarView, UTC). */
export declare function microsoftBusy(accessToken: string, from: Date, to: Date, fetchImpl?: typeof fetch): Promise<BusyInterval[]>;
//# sourceMappingURL=microsoft.d.ts.map