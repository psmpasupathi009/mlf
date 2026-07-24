import { describe, expect, it } from "vitest";
import { dateIsOfficeHoliday } from "@/features/hrms/lib/office-holiday";
import { buildOfficeClosedDayAvailability } from "@/lib/appointments/availability";
import { createOfficeHolidaySchema } from "@/lib/validations/hrms.schema";
import { istDayBounds } from "@/lib/utils/ist";

describe("dateIsOfficeHoliday", () => {
  const holidays = [
    { fromDate: "2026-10-20", toDate: "2026-10-22" },
    { fromDate: "2026-12-25", toDate: "2026-12-25" },
  ];

  it("covers inclusive multi-day ranges", () => {
    expect(dateIsOfficeHoliday("2026-10-20", holidays)).toBe(true);
    expect(dateIsOfficeHoliday("2026-10-21", holidays)).toBe(true);
    expect(dateIsOfficeHoliday("2026-10-22", holidays)).toBe(true);
    expect(dateIsOfficeHoliday("2026-10-19", holidays)).toBe(false);
    expect(dateIsOfficeHoliday("2026-10-23", holidays)).toBe(false);
  });

  it("covers single-day holidays", () => {
    expect(dateIsOfficeHoliday("2026-12-25", holidays)).toBe(true);
    expect(dateIsOfficeHoliday("2026-12-26", holidays)).toBe(false);
  });
});

describe("createOfficeHolidaySchema", () => {
  it("rejects inverted date ranges", () => {
    const parsed = createOfficeHolidaySchema.safeParse({
      fromDate: "2026-10-22",
      toDate: "2026-10-20",
      title: "Diwali",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a valid holiday", () => {
    const parsed = createOfficeHolidaySchema.safeParse({
      fromDate: "2026-10-20",
      toDate: "2026-10-22",
      title: "Diwali",
      notes: "Office closed",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("buildOfficeClosedDayAvailability", () => {
  it("returns no free slots and a full-day closed busy segment", () => {
    const { start, end } = istDayBounds("2026-10-20");
    const day = buildOfficeClosedDayAvailability({
      dateKey: "2026-10-20",
      advocateMobile: "9876543210",
      durationMin: 30,
      holidayTitle: "Diwali",
      dayStart: start,
      dayEnd: end,
    });
    expect(day.freeSlots).toEqual([]);
    expect(day.windows).toEqual([]);
    expect(day.onLeave).toBe(false);
    expect(day.busy).toHaveLength(1);
    expect(day.busy[0]?.reason).toBe("closed");
    expect(day.busy[0]?.label).toBe("Office closed — Diwali");
  });
});
