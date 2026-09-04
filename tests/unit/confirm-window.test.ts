import { describe, expect, it } from "vitest";
import {
  canShowConfirmButton,
  getConfirmWindowHours,
  isInConfirmWindow,
} from "@/lib/appointments/confirm-window";

describe("confirm-window", () => {
  it("defaults window hours to 1", () => {
    const prev = process.env.APPOINTMENT_CONFIRM_WINDOW_HOURS;
    delete process.env.APPOINTMENT_CONFIRM_WINDOW_HOURS;
    expect(getConfirmWindowHours()).toBe(1);
    if (prev !== undefined) process.env.APPOINTMENT_CONFIRM_WINDOW_HOURS = prev;
  });

  it("opens window N hours before and closes at slot end", () => {
    process.env.APPOINTMENT_CONFIRM_WINDOW_HOURS = "1";
    const scheduledAt = new Date("2026-09-04T12:00:00.000Z");
    const durationMin = 30;

    expect(
      isInConfirmWindow(scheduledAt, durationMin, new Date("2026-09-04T10:59:00.000Z"))
    ).toBe(false);
    expect(
      isInConfirmWindow(scheduledAt, durationMin, new Date("2026-09-04T11:00:00.000Z"))
    ).toBe(true);
    expect(
      isInConfirmWindow(scheduledAt, durationMin, new Date("2026-09-04T12:15:00.000Z"))
    ).toBe(true);
    expect(
      isInConfirmWindow(scheduledAt, durationMin, new Date("2026-09-04T12:31:00.000Z"))
    ).toBe(false);
  });

  it("hides confirm when already confirmed or not scheduled", () => {
    process.env.APPOINTMENT_CONFIRM_WINDOW_HOURS = "1";
    const scheduledAt = new Date("2026-09-04T12:00:00.000Z");
    const now = new Date("2026-09-04T11:30:00.000Z");

    expect(
      canShowConfirmButton({
        status: "scheduled",
        confirmedAt: null,
        scheduledAt,
        durationMin: 30,
        now,
      })
    ).toBe(true);

    expect(
      canShowConfirmButton({
        status: "scheduled",
        confirmedAt: now,
        scheduledAt,
        durationMin: 30,
        now,
      })
    ).toBe(false);

    expect(
      canShowConfirmButton({
        status: "cancelled",
        confirmedAt: null,
        scheduledAt,
        durationMin: 30,
        now,
      })
    ).toBe(false);
  });
});
