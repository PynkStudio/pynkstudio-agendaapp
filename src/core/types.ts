export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A bookable window on a weekday, in the event type's time zone. */
export type WeeklyWindow = {
  /** 0 = Sunday … 6 = Saturday. */
  day: Weekday;
  /** `HH:MM`, first possible start. */
  start: string;
  /** `HH:MM`, every slot must end by this time. `24:00` means end of day. */
  end: string;
};

export type LocationKind = "video" | "phone" | "in_person";

/**
 * Something a guest can book. Declared by the host in code: the package holds
 * no project values, so title, hours and time zone all come from here.
 */
export type AgendaEventType = {
  /** Stable identifier, stored on every booking. */
  id: string;
  title: string;
  durationMinutes: number;
  /** Distance between two consecutive slot starts. Defaults to `durationMinutes`. */
  slotStepMinutes?: number;
  /** IANA zone the weekly windows are expressed in, e.g. `Europe/Rome`. */
  timezone: string;
  weekly: readonly WeeklyWindow[];
  /** Free time enforced around each booking of the same calendar. */
  bufferMinutes?: number;
  /** A slot must start at least this far in the future. */
  minNoticeMinutes?: number;
  /** How many bookable days (days with at least one window) are offered. Default 14. */
  lookaheadDays?: number;
  /** Specific dates (`YYYY-MM-DD`) that are closed regardless of the weekly windows. */
  closedDates?: readonly string[];
  location: LocationKind;
  /**
   * Bookings on the same calendar collide with each other. Event types that
   * share a person or a room must share a calendar. Default `default`.
   */
  calendar?: string;
};

export type AgendaSlot = {
  /** `HH:MM` in the event type's time zone. */
  time: string;
  startUtc: string;
  endUtc: string;
  available: boolean;
};

export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export type AgendaBooking = {
  id: string;
  scope: string;
  eventType: string;
  calendar: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  location: LocationKind;
  name: string;
  email: string;
  phone: string | null;
  topic: string | null;
  /** Guest's own zone, when the booking client reported it. */
  guestTimezone: string | null;
  answers: Record<string, unknown>;
  source: string | null;
  videoRoom: string | null;
  videoStartedAt: string | null;
  videoEndedAt: string | null;
  reminderSentAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
};

export type BusyInterval = { start: Date; end: Date };
