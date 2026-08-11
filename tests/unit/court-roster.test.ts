import { describe, expect, it } from "vitest";
import {
  addCourtToDefaults,
  buildCourtRosterForDate,
  dateRangesOverlap,
  eachIstDateInclusive,
  findAdvocateDutyClash,
  findOverlappingOverride,
  isDateInRange,
  removeCourtFromDefaults,
  resolveEndOverride,
} from "@/features/court-roster/lib/effective-cover";

const courtA = {
  state: "Tamil Nadu",
  district: "Erode",
  city: "Gobichettipalayam",
  courtName: "JM No.I",
};

const courtB = {
  state: "Tamil Nadu",
  district: "Erode",
  city: "Erode",
  courtName: "Sub Court",
};

describe("dateRangesOverlap", () => {
  it("detects inclusive overlap", () => {
    expect(dateRangesOverlap("2026-08-01", "2026-08-10", "2026-08-10", "2026-08-12")).toBe(
      true
    );
    expect(dateRangesOverlap("2026-08-01", "2026-08-05", "2026-08-06", "2026-08-12")).toBe(
      false
    );
  });
});

describe("isDateInRange", () => {
  it("includes edges", () => {
    expect(isDateInRange("2026-08-12", "2026-08-12", "2026-08-20")).toBe(true);
    expect(isDateInRange("2026-08-20", "2026-08-12", "2026-08-20")).toBe(true);
    expect(isDateInRange("2026-08-11", "2026-08-12", "2026-08-20")).toBe(false);
  });
});

describe("eachIstDateInclusive", () => {
  it("lists days", () => {
    expect(eachIstDateInclusive("2026-08-10", "2026-08-12")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("returns empty when from > to", () => {
    expect(eachIstDateInclusive("2026-08-12", "2026-08-10")).toEqual([]);
  });
});

describe("findOverlappingOverride", () => {
  it("rejects same court overlapping dates", () => {
    const hit = findOverlappingOverride(
      [
        {
          unitId: "CDU-00001",
          ...courtA,
          fromDate: "2026-08-01",
          toDate: "2026-08-15",
        },
      ],
      { ...courtA, fromDate: "2026-08-10", toDate: "2026-08-20" }
    );
    expect(hit?.unitId).toBe("CDU-00001");
  });

  it("allows different courts", () => {
    expect(
      findOverlappingOverride(
        [
          {
            unitId: "CDU-00001",
            ...courtA,
            fromDate: "2026-08-01",
            toDate: "2026-08-15",
          },
        ],
        { ...courtB, fromDate: "2026-08-01", toDate: "2026-08-15" }
      )
    ).toBeNull();
  });

  it("can exclude self when editing", () => {
    expect(
      findOverlappingOverride(
        [
          {
            unitId: "CDU-00001",
            ...courtA,
            fromDate: "2026-08-01",
            toDate: "2026-08-15",
          },
        ],
        { ...courtA, fromDate: "2026-08-01", toDate: "2026-08-20" },
        "CDU-00001"
      )
    ).toBeNull();
  });
});

describe("buildCourtRosterForDate", () => {
  const dinesh = {
    userId: "u1",
    unitId: "EMP-00001",
    mobile: "9876502001",
    name: "Dinesh",
    displayName: "Dinesh",
    defaultCourts: [courtA],
  };
  const siva = {
    userId: "u2",
    unitId: "EMP-00002",
    mobile: "9876502002",
    name: "Siva",
    displayName: "Siva",
    defaultCourts: [courtB],
  };

  it("inverts permanent defaults", () => {
    const rows = buildCourtRosterForDate({
      date: "2026-08-12",
      advocates: [dinesh, siva],
      overrides: [],
    });
    expect(rows).toHaveLength(2);
    const jm = rows.find((r) => r.courtName === "JM No.I");
    expect(jm?.permanent.map((p) => p.unitId)).toEqual(["EMP-00001"]);
    expect(jm?.covering.map((p) => p.unitId)).toEqual(["EMP-00001"]);
    expect(jm?.activeOverride).toBeNull();
  });

  it("override wins over permanents for that date", () => {
    const rows = buildCourtRosterForDate({
      date: "2026-08-12",
      advocates: [dinesh, siva],
      overrides: [
        {
          unitId: "CDU-00001",
          ...courtA,
          advocateUserId: "u2",
          advocateUnitId: "EMP-00002",
          advocateMobile: "9876502002",
          fromDate: "2026-08-10",
          toDate: "2026-08-20",
          advocateName: "Siva",
          advocateDisplayName: "Siva",
        },
      ],
    });
    const jm = rows.find((r) => r.courtName === "JM No.I");
    expect(jm?.permanent.map((p) => p.unitId)).toEqual(["EMP-00001"]);
    expect(jm?.covering.map((p) => p.unitId)).toEqual(["EMP-00002"]);
    expect(jm?.activeOverride?.unitId).toBe("CDU-00001");
  });

  it("override outside date does not apply", () => {
    const rows = buildCourtRosterForDate({
      date: "2026-08-12",
      advocates: [dinesh],
      overrides: [
        {
          unitId: "CDU-00001",
          ...courtA,
          advocateUserId: "u2",
          advocateUnitId: "EMP-00002",
          advocateMobile: "9876502002",
          fromDate: "2026-08-01",
          toDate: "2026-08-05",
        },
      ],
    });
    const jm = rows.find((r) => r.courtName === "JM No.I");
    expect(jm?.covering.map((p) => p.unitId)).toEqual(["EMP-00001"]);
    expect(jm?.activeOverride).toBeNull();
  });
});

describe("findAdvocateDutyClash", () => {
  it("blocks same advocate on two courts overlapping", () => {
    const hit = findAdvocateDutyClash(
      [
        {
          unitId: "CDU-00001",
          advocateUnitId: "EMP-00002",
          ...courtA,
          fromDate: "2026-08-01",
          toDate: "2026-08-15",
        },
      ],
      {
        advocateUnitId: "EMP-00002",
        ...courtB,
        fromDate: "2026-08-10",
        toDate: "2026-08-20",
      }
    );
    expect(hit?.courtName).toBe("JM No.I");
  });

  it("allows same advocate different non-overlapping dates", () => {
    expect(
      findAdvocateDutyClash(
        [
          {
            unitId: "CDU-00001",
            advocateUnitId: "EMP-00002",
            ...courtA,
            fromDate: "2026-08-01",
            toDate: "2026-08-05",
          },
        ],
        {
          advocateUnitId: "EMP-00002",
          ...courtB,
          fromDate: "2026-08-10",
          toDate: "2026-08-20",
        }
      )
    ).toBeNull();
  });
});

describe("resolveEndOverride", () => {
  it("deletes future-only covers", () => {
    expect(
      resolveEndOverride({
        fromDate: "2026-08-20",
        toDate: "2026-08-25",
        today: "2026-08-12",
      })
    ).toEqual({ action: "delete" });
  });

  it("truncates active covers to yesterday", () => {
    expect(
      resolveEndOverride({
        fromDate: "2026-08-01",
        toDate: "2026-08-20",
        today: "2026-08-12",
      })
    ).toEqual({ action: "truncate", toDate: "2026-08-11" });
  });

  it("deletes covers that started today", () => {
    expect(
      resolveEndOverride({
        fromDate: "2026-08-12",
        toDate: "2026-08-20",
        today: "2026-08-12",
      })
    ).toEqual({ action: "delete" });
  });
});

describe("add/remove court defaults", () => {
  it("adds once", () => {
    const once = addCourtToDefaults([], courtA);
    expect(once).toHaveLength(1);
    expect(addCourtToDefaults(once, courtA)).toHaveLength(1);
  });

  it("removes by key", () => {
    expect(removeCourtFromDefaults([courtA, courtB], courtA)).toEqual([courtB]);
  });
});
