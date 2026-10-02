/**
 * "Save to calendar" for guests: an iCalendar file plus Google and Outlook
 * links. Pure functions, browser-safe.
 */
export type CalendarEventInput = {
    /** Stable id: the same booking must always produce the same UID. */
    uid: string;
    start: Date | string;
    end: Date | string;
    title: string;
    description?: string;
    location?: string;
    url?: string;
    /** Shown as organizer in calendar apps. */
    organizer?: {
        name: string;
        email: string;
    };
};
/**
 * A single-event iCalendar document (`METHOD:PUBLISH`): opening it adds the
 * event to Apple Calendar, Outlook, Google and most other apps.
 * `status: "CANCELLED"` with the same uid removes it in apps that honour it.
 */
export declare function eventIcs(input: CalendarEventInput & {
    status?: "CONFIRMED" | "CANCELLED";
    sequence?: number;
    productId?: string;
}): string;
/** "Add to Google Calendar" link (opens the event form prefilled). */
export declare function googleCalendarLink(input: CalendarEventInput): string;
/**
 * "Add to Outlook" link. `account: "personal"` targets outlook.live.com
 * (Hotmail, Outlook.com), `"work"` targets Microsoft 365 (outlook.office.com).
 */
export declare function outlookCalendarLink(input: CalendarEventInput, account?: "personal" | "work"): string;
//# sourceMappingURL=ics.d.ts.map