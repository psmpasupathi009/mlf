import { describe, expect, it } from "vitest";
import { resolveCoverageSchema } from "@/lib/validations/coverage.schema";
import { courtKey, parseDefaultCourts } from "@/lib/hearings/court-key";
import { OFFICE_ROSTER } from "@/config/company/office-roster";

describe("resolveCoverageSchema", () => {
  it("accepts cover / cover_batch / reassign_permanent / adjourn / dismiss", () => {
    expect(
      resolveCoverageSchema.parse({ action: "cover", toMobile: "9786570408" })
        .action
    ).toBe("cover");
    expect(
      resolveCoverageSchema.parse({
        action: "cover_batch",
        toMobile: "9786570408",
      }).action
    ).toBe("cover_batch");
    expect(
      resolveCoverageSchema.parse({
        action: "reassign_permanent",
        toMobile: "6379614984",
      }).action
    ).toBe("reassign_permanent");
    expect(
      resolveCoverageSchema.parse({
        action: "adjourn",
        nextHearingDate: "2026-08-20",
      }).action
    ).toBe("adjourn");
    expect(resolveCoverageSchema.parse({ action: "dismiss" }).action).toBe(
      "dismiss"
    );
  });

  it("rejects cover without mobile", () => {
    expect(
      resolveCoverageSchema.safeParse({ action: "cover" }).success
    ).toBe(false);
  });
});

describe("PDF defaultCourts ↔ courtKey matching", () => {
  it("Ajith matches Gobi District Munsif for cover suggest", () => {
    const ajith = OFFICE_ROSTER.find((r) => r.name.startsWith("Ajith"));
    expect(ajith).toBeTruthy();
    const caseCourt = {
      state: "Tamil Nadu",
      district: "Erode",
      city: "Gobichettipalayam",
      courtName: "District Munsif Court, Gobichettipalayam",
    };
    const courts = parseDefaultCourts(ajith!.defaultCourts);
    expect(courts.some((c) => courtKey(c) === courtKey(caseCourt))).toBe(true);
  });

  it("Surya matches Kolkata MM and Chennai CJC from PDF", () => {
    const surya = OFFICE_ROSTER.find((r) => r.name.startsWith("Surya"));
    expect(surya?.defaultCourts.length).toBe(11);
    const keys = new Set(
      parseDefaultCourts(surya!.defaultCourts).map((c) => courtKey(c))
    );
    expect(
      keys.has(
        courtKey({
          state: "West Bengal",
          district: "Kolkata",
          city: "Kolkata",
          courtName: "Metropolitan Magistrate Court, Kolkata",
        })
      )
    ).toBe(true);
    expect(
      keys.has(
        courtKey({
          state: "Tamil Nadu",
          district: "Chennai",
          city: "Chennai",
          courtName: "Chief Judicial Court, Chennai",
        })
      )
    ).toBe(true);
  });

  it("Vignesh has all 14 PDF courts", () => {
    const v = OFFICE_ROSTER.find((r) => r.name.startsWith("Vignesh"));
    expect(v?.defaultCourts.length).toBe(14);
  });
});
