/**
 * Public holidays as `YYYY-MM-DD` dates. Pure functions, browser-safe.
 * Add a country by adding an entry to HOLIDAY_CALENDARS.
 */
/** Easter Sunday (Gregorian), anonymous algorithm. */
export declare function easterSunday(year: number): string;
/** Italian national holidays (feste nazionali civili e religiose riconosciute). */
export declare function italianHolidays(year: number): string[];
export declare const HOLIDAY_CALENDARS: Record<string, {
    label: string;
    dates: (year: number) => string[];
}>;
export declare function isHoliday(codes: readonly string[] | undefined, dateISO: string): boolean;
//# sourceMappingURL=holidays.d.ts.map