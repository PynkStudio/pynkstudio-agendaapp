import { describe, expect, it } from "vitest";

import {
  bookableDays,
  candidateSlots,
  isBookableStart,
  overlapsBusy,
  slotsForDate,
} from "../availability.js";
import type { AgendaEventType } from "../types.js";
import { zonedWallClockToUtc } from "../time.js";

const call: AgendaEventType = {
  id: "call-20",
  title: "Call",
  durationMinutes: 20,
  timezone: "Europe/Rome",
  weekly: [1, 2, 3, 4, 5].map((day) => ({ day: day as 1, start: "10:00", end: "18:00" })),
  location: "video",
};

describe("zonedWallClockToUtc", () => {
  it("handles summer and winter offsets", () => {
    expect(zonedWallClockToUtc("Europe/Rome", "2026-07-01", 10, 0).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedWallClockToUtc("Europe/Rome", "2026-12-01", 10, 0).toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("settles on DST transition days", () => {
    // 2026-03-29: Rome jumps from 02:00 to 03:00; 2026-10-25: back from 03:00 to 02:00.
    expect(zonedWallClockToUtc("Europe/Rome", "2026-03-29", 10, 0).toISOString()).toBe("2026-03-29T08:00:00.000Z");
    expect(zonedWallClockToUtc("Europe/Rome", "2026-10-25", 10, 0).toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });
});

describe("slots", () => {
  it("generates 24 twenty-minute slots between 10 and 18", () => {
    const slots = candidateSlots(call, "2026-10-05");
    expect(slots).toHaveLength(24);
    expect(slots[0].time).toBe("10:00");
    expect(slots.at(-1)?.time).toBe("17:40");
  });

  it("has no slots on weekends or closed dates", () => {
    expect(candidateSlots(call, "2026-10-03")).toHaveLength(0);
    expect(candidateSlots({ ...call, closedDates: ["2026-10-05"] }, "2026-10-05")).toHaveLength(0);
  });

  it("offers the next N days that have windows, starting today", () => {
    const now = new Date("2026-10-02T15:00:00Z"); // Friday
    const days = bookableDays({ ...call, lookaheadDays: 3 }, now);
    expect(days).toEqual(["2026-10-02", "2026-10-05", "2026-10-06"]);
  });

  it("marks past, too-close and busy slots unavailable", () => {
    const now = new Date("2026-10-05T08:30:00Z"); // 10:30 Rome
    const busy = [{ start: new Date("2026-10-05T09:00:00Z"), end: new Date("2026-10-05T09:20:00Z") }];
    const slots = slotsForDate({ ...call, minNoticeMinutes: 30 }, "2026-10-05", busy, now);
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s.available]));
    expect(byTime["10:20"]).toBe(false); // past
    expect(byTime["10:40"]).toBe(false); // within notice
    expect(byTime["11:00"]).toBe(false); // busy
    expect(byTime["11:20"]).toBe(true);
  });

  it("applies the buffer after a slot, like the database constraint", () => {
    const busy = [{ start: new Date("2026-10-05T09:30:00Z"), end: new Date("2026-10-05T09:50:00Z") }];
    const start = new Date("2026-10-05T09:00:00Z");
    const end = new Date("2026-10-05T09:20:00Z");
    expect(overlapsBusy(start, end, busy, 0)).toBe(false);
    expect(overlapsBusy(start, end, busy, 15)).toBe(true);
  });

  it("only accepts exact, future, in-range starts", () => {
    const now = new Date("2026-10-05T06:00:00Z");
    expect(isBookableStart(call, new Date("2026-10-05T08:20:00Z"), now)).toBe(true);
    expect(isBookableStart(call, new Date("2026-10-05T08:25:00Z"), now)).toBe(false);
    expect(isBookableStart(call, new Date("2026-10-05T05:00:00Z"), now)).toBe(false);
    expect(isBookableStart(call, new Date("2027-10-05T08:20:00Z"), now)).toBe(false);
    expect(isBookableStart(call, new Date("nope"), now)).toBe(false);
  });
});
