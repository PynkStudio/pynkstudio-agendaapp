import type { BusyInterval } from "../core/types.js";

export type CalendarProvider = "google" | "microsoft" | "caldav" | "ics";

export type OAuthCredentials = { accessToken: string; refreshToken: string | null; expiresAt: number };
export type CalDavCredentials = {
  server: string;
  username: string;
  password: string;
  /** Calendar collection URLs found by discovery, cached to skip it next time. */
  calendars?: string[];
};
export type IcsCredentials = { url: string };
export type ProviderCredentials = OAuthCredentials | CalDavCredentials | IcsCredentials;

export type OAuthClient = { clientId: string; clientSecret: string };

export type CalendarsConfig = {
  /** Secret used to encrypt stored credentials (at least 32 characters). Never change it after the first connection. */
  credentialsKey: string;
  /** Absolute URL of the OAuth callback route for a provider (mount `calendarCallback` there). */
  redirectUri: (provider: "google" | "microsoft") => string;
  google?: OAuthClient | null;
  /** `tenant` defaults to `common` (work, school and personal accounts). */
  microsoft?: (OAuthClient & { tenant?: string }) | null;
  /** Seconds a fetched busy list is reused. Default 120. */
  cacheSeconds?: number;
  fetch?: typeof fetch;
};

export type BusyResult = { busy: BusyInterval[]; credentials?: ProviderCredentials };

export class CalendarAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarAuthError";
  }
}

/** A calendar the account can write to, offered as a destination for bookings. */
export type WritableCalendar = { id: string; name: string; primary?: boolean };

/** What the package writes into a team member's calendar. */
export type HostEvent = { title: string; description?: string; location?: string; start: Date; end: Date; uid: string };
