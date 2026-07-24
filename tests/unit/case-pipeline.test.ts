import { describe, expect, it } from "vitest";
import {
  canTransitionStatus,
  normalizeCaseStatus,
  PRE_NUMBER_STATUSES,
  OPEN_CASE_STATUSES,
} from "@/config/company/case-pipeline";

describe("normalizeCaseStatus", () => {
  it("maps legacy pending/listed", () => {
    expect(normalizeCaseStatus("pending")).toBe("pre_filing");
    expect(normalizeCaseStatus("listed")).toBe("active");
  });

  it("passes through pipeline statuses", () => {
    expect(normalizeCaseStatus("filing_defect")).toBe("filing_defect");
    expect(normalizeCaseStatus("archived")).toBe("archived");
  });
});

describe("canTransitionStatus", () => {
  it("allows filing defect loop", () => {
    expect(canTransitionStatus("under_filing", "filing_defect")).toBe(true);
    expect(canTransitionStatus("filing_defect", "under_filing")).toBe(true);
    expect(canTransitionStatus("under_filing", "active")).toBe(true);
  });

  it("blocks nonsense jumps", () => {
    expect(canTransitionStatus("enquiry", "disposed")).toBe(false);
    expect(canTransitionStatus("archived", "enquiry")).toBe(false);
  });
});

describe("status sets", () => {
  it("includes filing statuses in pre-number", () => {
    expect(PRE_NUMBER_STATUSES).toContain("filing_defect");
    expect(PRE_NUMBER_STATUSES).not.toContain("active");
  });

  it("open set excludes disposed/archived", () => {
    expect(OPEN_CASE_STATUSES).toContain("active");
    expect(OPEN_CASE_STATUSES).not.toContain("disposed");
    expect(OPEN_CASE_STATUSES).not.toContain("archived");
  });
});
