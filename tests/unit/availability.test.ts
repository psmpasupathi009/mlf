import { describe, expect, it } from "vitest";
import {
  intervalsOverlap,
  minutesToTime,
  timeToMinutes,
  addMinutes,
} from "@/lib/appointments/availability";
import { rangesFromWorkAndBreak } from "@/config/company/booking";
import { istAddCalendarDays } from "@/lib/utils/ist";

describe("intervalsOverlap", () => {
  it("detects overlap", () => {
    const a0 = new Date("2026-07-24T10:00:00+05:30");
    const a1 = addMinutes(a0, 30);
    const b0 = new Date("2026-07-24T10:15:00+05:30");
    const b1 = addMinutes(b0, 30);
    expect(intervalsOverlap(a0, a1, b0, b1)).toBe(true);
  });

  it("allows back-to-back (half-open)", () => {
    const a0 = new Date("2026-07-24T10:00:00+05:30");
    const a1 = addMinutes(a0, 30);
    const b0 = new Date("2026-07-24T10:30:00+05:30");
    const b1 = addMinutes(b0, 30);
    expect(intervalsOverlap(a0, a1, b0, b1)).toBe(false);
  });
});

describe("time helpers", () => {
  it("parses and formats HH:mm", () => {
    expect(timeToMinutes("09:30")).toBe(9 * 60 + 30);
    expect(minutesToTime(9 * 60 + 30)).toBe("09:30");
  });
});

describe("rangesFromWorkAndBreak", () => {
  it("splits around a shared break", () => {
    expect(
      rangesFromWorkAndBreak({
        workStart: "09:30",
        workEnd: "18:00",
        breakStart: "13:00",
        breakEnd: "14:00",
      })
    ).toEqual([
      { startTime: "09:30", endTime: "13:00" },
      { startTime: "14:00", endTime: "18:00" },
    ]);
  });

  it("returns one range when break is off", () => {
    expect(
      rangesFromWorkAndBreak({
        workStart: "09:30",
        workEnd: "18:00",
      })
    ).toEqual([{ startTime: "09:30", endTime: "18:00" }]);
  });
});

describe("istAddCalendarDays", () => {
  it("adds one IST calendar day", () => {
    expect(istAddCalendarDays("2026-07-23", 1)).toBe("2026-07-24");
  });
});
