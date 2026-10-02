import type { BusyInterval } from "../core/types.js";
/** Busy times of the account's primary calendar (FreeBusy API, scope calendar.freebusy). */
export declare function googleBusy(accessToken: string, from: Date, to: Date, fetchImpl?: typeof fetch): Promise<BusyInterval[]>;
//# sourceMappingURL=google.d.ts.map