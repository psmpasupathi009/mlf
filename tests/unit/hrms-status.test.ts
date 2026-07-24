import { describe, expect, it } from "vitest";
import {
  dateRangesOverlap,
  derivePresenceStatus,
  leaveCoversDate,
} from "@/features/hrms/lib/status";

describe("dateRangesOverlap", () => {
  it("detects overlapping leave windows", () => {
    expect(dateRangesOverlap("2026-07-01", "2026-07-03", "2026-07-03", "2026-07-05")).toBe(
      true
    );
    expect(dateRangesOverlap("2026-07-01", "2026-07-02", "2026-07-03", "2026-07-05")).toBe(
      false
    );
    expect(dateRangesOverlap("2026-07-10", "2026-07-12", "2026-07-01", "2026-07-20")).toBe(
      true
    );
  });
});

describe("leaveCoversDate", () => {
  it("covers inclusive IST day keys", () => {
    expect(leaveCoversDate("2026-07-24", "2026-07-26", "2026-07-24")).toBe(true);
    expect(leaveCoversDate("2026-07-24", "2026-07-26", "2026-07-26")).toBe(true);
    expect(leaveCoversDate("2026-07-24", "2026-07-26", "2026-07-23")).toBe(false);
  });
});

describe("derivePresenceStatus", () => {
  it("prefer on_leave over check-in", () => {
    expect(
      derivePresenceStatus({
        onApprovedLeave: true,
        checkInAt: new Date(),
        checkOutAt: null,
      })
    ).toBe("on_leave");
  });

  it("maps check-out to out (checked out for the day)", () => {
    expect(
      derivePresenceStatus({
        onApprovedLeave: false,
        checkInAt: new Date(),
        checkOutAt: new Date(),
      })
    ).toBe("out");
  });

  it("maps check-in only to in", () => {
    expect(
      derivePresenceStatus({
        onApprovedLeave: false,
        checkInAt: new Date(),
        checkOutAt: null,
      })
    ).toBe("in");
  });

  it("maps neither to absent", () => {
    expect(
      derivePresenceStatus({
        onApprovedLeave: false,
        checkInAt: null,
        checkOutAt: null,
      })
    ).toBe("absent");
  });
});
