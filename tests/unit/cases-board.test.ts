import { describe, expect, it } from "vitest";
import {
  boardCourtStatusColumns,
  groupCasesByCourtStatus,
  UNSET_COURT_STATUS,
} from "@/features/cases/lib/board-columns";
import { buildCaseListWhere } from "@/features/cases/server/filters";

describe("boardCourtStatusColumns", () => {
  it("returns type-specific court status list for CC", () => {
    const cols = boardCourtStatusColumns("CC");
    expect(cols.length).toBeGreaterThan(5);
    expect(cols).toContain("Arguments");
  });

  it("returns civil/suit list for OS", () => {
    const cols = boardCourtStatusColumns("OS");
    expect(cols).toContain("Filing the suit / petition");
    expect(cols).not.toContain("Summon to accused");
  });
});

describe("groupCasesByCourtStatus", () => {
  it("buckets by stage / unset", () => {
    const columns = ["Arguments", "Evidence"];
    const groups = groupCasesByCourtStatus(
      [
        { unitId: "1", stage: "Arguments" },
        { unitId: "2", stage: null },
        { unitId: "3", stage: "Custom other" },
      ],
      columns
    );
    expect(groups.Arguments.map((r) => r.unitId)).toEqual(["1"]);
    expect(groups[UNSET_COURT_STATUS].map((r) => r.unitId)).toEqual([
      "2",
      "3",
    ]);
  });
});

describe("buildCaseListWhere caseType", () => {
  it("filters by caseType", () => {
    const where = buildCaseListWhere({ caseType: "CC" });
    expect(where.caseType).toBe("CC");
  });
});
