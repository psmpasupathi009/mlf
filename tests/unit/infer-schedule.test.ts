import { describe, expect, it } from "vitest";
import { bookingDefaults } from "@/config/company/booking";
import {
  inferSchedule,
  normalizeHm,
} from "@/features/availability/lib/infer-schedule";

describe("inferSchedule", () => {
  it("uses office defaults when usingDefaults and days are empty", () => {
    const days = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      ranges: [] as { startTime: string; endTime: string }[],
    }));
    const result = inferSchedule(days, true);
    expect([...result.openDays].sort()).toEqual(
      [...bookingDefaults.defaultOpenWeekdays].sort()
    );
    expect(result.workStart).toBe(bookingDefaults.workStart);
    expect(result.hasBreak).toBe(true);
  });

  it("keeps an explicitly closed week closed (not defaults)", () => {
    const days = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      ranges: [] as { startTime: string; endTime: string }[],
    }));
    const result = inferSchedule(days, false);
    expect(result.openDays.size).toBe(0);
  });

  it("ignores zero-length sentinel ranges", () => {
    const days = [
      { weekday: 0, ranges: [{ startTime: "00:00", endTime: "00:00" }] },
      ...Array.from({ length: 6 }, (_, i) => ({
        weekday: i + 1,
        ranges: [] as { startTime: string; endTime: string }[],
      })),
    ];
    const result = inferSchedule(days, false);
    expect(result.openDays.size).toBe(0);
  });

  it("infers shared break from two-range days", () => {
    const days = [
      {
        weekday: 1,
        ranges: [
          { startTime: "09:30", endTime: "13:00" },
          { startTime: "14:00", endTime: "18:00" },
        ],
      },
      ...[2, 3, 4, 5, 6, 0].map((weekday) => ({
        weekday,
        ranges: [] as { startTime: string; endTime: string }[],
      })),
    ];
    const result = inferSchedule(days, false);
    expect(result.openDays.has(1)).toBe(true);
    expect(result.workStart).toBe("09:30");
    expect(result.workEnd).toBe("18:00");
    expect(result.hasBreak).toBe(true);
    expect(result.breakStart).toBe("13:00");
    expect(result.breakEnd).toBe("14:00");
  });
});

describe("normalizeHm", () => {
  it("pads single-digit hours", () => {
    expect(normalizeHm("9:30")).toBe("09:30");
  });

  it("leaves valid HH:mm unchanged", () => {
    expect(normalizeHm("09:30")).toBe("09:30");
  });
});
