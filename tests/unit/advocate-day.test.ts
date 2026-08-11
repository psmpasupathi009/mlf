import { describe, expect, it } from "vitest";
import {
  clashMessage,
  findCrossCourtClash,
  mobileLookupVariants,
} from "@/lib/hearings/advocate-day";
import {
  courtKey,
  effectiveHearingAdvocate,
  parseDefaultCourts,
} from "@/lib/hearings/court-key";

describe("courtKey", () => {
  it("normalizes case and whitespace", () => {
    expect(
      courtKey({
        state: " Tamil Nadu ",
        district: "ERODE",
        city: "Gobi",
        courtName: "JM No.I",
      })
    ).toBe("tamil nadu|erode|gobi|jm no.i");
  });
});

describe("effectiveHearingAdvocate", () => {
  it("returns primary advocate", () => {
    expect(
      effectiveHearingAdvocate({
        primaryAdvocateMobile: "9876502001",
      })
    ).toBe("9876502001");
  });

  it("returns null when missing", () => {
    expect(
      effectiveHearingAdvocate({
        primaryAdvocateMobile: null,
      })
    ).toBeNull();
  });
});

describe("parseDefaultCourts", () => {
  it("keeps complete rows only", () => {
    expect(
      parseDefaultCourts([
        {
          state: "Tamil Nadu",
          district: "Erode",
          city: "Gobi",
          courtName: "JM No.I",
        },
        { state: "Tamil Nadu", district: "", city: "Gobi", courtName: "X" },
      ])
    ).toEqual([
      {
        state: "Tamil Nadu",
        district: "Erode",
        city: "Gobi",
        courtName: "JM No.I",
      },
    ]);
  });
});

describe("findCrossCourtClash", () => {
  const advocate = "919876502001";
  const courtA = {
    primaryAdvocateMobile: "9876502001",
    state: "Tamil Nadu",
    district: "Erode",
    city: "Gobi",
    courtName: "JM No.I",
  };
  const courtB = {
    ...courtA,
    courtName: "JM No.II",
  };

  it("allows same court same day for two hearings", () => {
    const cases = new Map([
      ["C1", courtA],
      ["C2", courtA],
    ]);
    const result = findCrossCourtClash({
      advocateMobile91: advocate,
      targetCourtKey: courtKey(courtA),
      hearings: [{ caseUnitId: "C1" }, { caseUnitId: "C2" }],
      casesByUnit: cases,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects different court same day", () => {
    const cases = new Map([
      ["C1", courtA],
      ["C2", courtB],
    ]);
    const result = findCrossCourtClash({
      advocateMobile91: advocate,
      targetCourtKey: courtKey(courtB),
      hearings: [{ caseUnitId: "C1" }],
      casesByUnit: cases,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("other_court");
  });

  it("ignores hearings for other advocates", () => {
    const cases = new Map([
      [
        "C1",
        {
          ...courtA,
          primaryAdvocateMobile: "9876502999",
        },
      ],
    ]);
    const result = findCrossCourtClash({
      advocateMobile91: advocate,
      targetCourtKey: courtKey(courtB),
      hearings: [{ caseUnitId: "C1" }],
      casesByUnit: cases,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("clashMessage", () => {
  it("describes leave and other court", () => {
    expect(clashMessage({ ok: false, reason: "on_leave" })).toMatch(/leave/i);
    expect(
      clashMessage({
        ok: false,
        reason: "other_court",
        detail: "JM No.I",
      })
    ).toContain("JM No.I");
    expect(clashMessage({ ok: false, reason: "appointment" })).toMatch(
      /appointment/i
    );
  });
});

describe("mobileLookupVariants", () => {
  it("includes 91 and 10-digit forms", () => {
    const v = mobileLookupVariants("919876502001");
    expect(v).toContain("919876502001");
    expect(v).toContain("9876502001");
  });
});
