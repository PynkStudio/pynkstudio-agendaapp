import { describe, expect, it } from "vitest";

import { candidateSlots } from "../availability.js";
import { easterSunday, isHoliday, italianHolidays } from "../holidays.js";
import type { AgendaEventType } from "../types.js";

describe("holidays", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2024)).toBe("2024-03-31");
  });

  it("lists Italian national holidays with Pasquetta", () => {
    const y = italianHolidays(2026);
    expect(y).toContain("2026-04-06");
    expect(y).toContain("2026-06-02");
    expect(y).toContain("2026-12-26");
    expect(y).toContain("2026-10-04");
    expect(italianHolidays(2025)).not.toContain("2025-10-04");
  });

  it("closes holidays only when the event type asks for it", () => {
    const et: AgendaEventType = {
      id: "x",
      title: "x",
      durationMinutes: 30,
      timezone: "Europe/Rome",
      weekly: [{ day: 2, start: "09:00", end: "12:00" }],
      location: "video",
    };
    // 2026-12-08 (Immacolata) is a Tuesday.
    expect(candidateSlots(et, "2026-12-08").length).toBe(6);
    expect(candidateSlots({ ...et, holidays: ["IT"] }, "2026-12-08")).toEqual([]);
    expect(isHoliday(["XX"], "2026-12-08")).toBe(false);
  });
});
