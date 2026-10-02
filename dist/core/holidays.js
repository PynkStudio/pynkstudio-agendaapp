/**
 * Public holidays as `YYYY-MM-DD` dates. Pure functions, browser-safe.
 * Add a country by adding an entry to HOLIDAY_CALENDARS.
 */
/** Easter Sunday (Gregorian), anonymous algorithm. */
export function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function plusDays(dateISO, days) {
    const d = new Date(`${dateISO}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
/** Italian national holidays (feste nazionali civili e religiose riconosciute). */
export function italianHolidays(year) {
    const fixed = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"];
    // San Francesco d'Assisi, festa nazionale di nuovo dal 2026.
    if (year >= 2026)
        fixed.push("10-04");
    const easter = easterSunday(year);
    return [...fixed.map((md) => `${year}-${md}`), easter, plusDays(easter, 1)].sort();
}
export const HOLIDAY_CALENDARS = {
    IT: { label: "Italia — festività nazionali", dates: italianHolidays },
};
const cache = new Map();
export function isHoliday(codes, dateISO) {
    if (!codes?.length)
        return false;
    const year = Number(dateISO.slice(0, 4));
    for (const code of codes) {
        const calendar = HOLIDAY_CALENDARS[code];
        if (!calendar)
            continue;
        const key = `${code}:${year}`;
        let set = cache.get(key);
        if (!set) {
            set = new Set(calendar.dates(year));
            cache.set(key, set);
        }
        if (set.has(dateISO))
            return true;
    }
    return false;
}
//# sourceMappingURL=holidays.js.map