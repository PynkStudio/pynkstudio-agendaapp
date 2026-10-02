import type { BusyInterval } from "../core/types.js";
export declare function normalizeIcsUrl(url: string): string;
/** Busy times from a published calendar feed (Google secret address, Outlook "publish", iCloud public link…). */
export declare function icsBusy(url: string, from: Date, to: Date, fetchImpl?: typeof fetch): Promise<BusyInterval[]>;
//# sourceMappingURL=ics.d.ts.map