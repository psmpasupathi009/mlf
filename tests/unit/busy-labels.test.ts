import { describe, expect, it } from "vitest";
import {
  blockKindLabel,
  busySegmentLabel,
  summarizeBusyToday,
} from "@/features/availability/lib/busy-labels";

describe("blockKindLabel", () => {
  it("maps known kinds", () => {
    expect(blockKindLabel("court")).toBe("Court");
    expect(blockKindLabel("break")).toBe("Break");
    expect(blockKindLabel("other")).toBe("Travel / site");
  });
});

describe("busySegmentLabel", () => {
  it("prefers free-text reason for blocks", () => {
    expect(
      busySegmentLabel({
        reason: "block",
        label: "Gobichettipalayam court",
        kind: "court",
      })
    ).toBe("Gobichettipalayam court");
  });

  it("uses In court when kind is court and no note", () => {
    expect(
      busySegmentLabel({ reason: "block", label: null, kind: "court" })
    ).toBe("In court");
  });

  it("labels appointments with title", () => {
    expect(
      busySegmentLabel({ reason: "appointment", label: "Consultation" })
    ).toBe("Appointment · Consultation");
  });
});

describe("summarizeBusyToday", () => {
  it("returns null when empty", () => {
    expect(summarizeBusyToday([])).toBeNull();
  });

  it("summarizes a single block with kind and times", () => {
    const text = summarizeBusyToday([
      {
        kind: "court",
        startsAt: "2026-07-25T05:00:00.000Z", // 10:30 IST
        endsAt: "2026-07-25T07:30:00.000Z", // 13:00 IST
        reason: null,
      },
    ]);
    expect(text).toMatch(/^Court /);
    expect(text).toContain("–");
  });

  it("summarizes a client appointment as Client meet", () => {
    const text = summarizeBusyToday([
      {
        kind: "appointment",
        startsAt: "2026-07-25T10:30:00.000Z",
        endsAt: "2026-07-25T11:00:00.000Z",
        reason: "Consultation",
      },
    ]);
    expect(text).toMatch(/^Client meet /);
  });

  it("summarizes multiple blocks", () => {
    expect(
      summarizeBusyToday([
        {
          kind: "court",
          startsAt: "2026-07-25T05:00:00.000Z",
          endsAt: "2026-07-25T07:30:00.000Z",
          reason: null,
        },
        {
          kind: "other",
          startsAt: "2026-07-25T10:00:00.000Z",
          endsAt: "2026-07-25T11:00:00.000Z",
          reason: "Client site",
        },
      ])
    ).toBe("Busy · 2 blocks");
  });
});
