import { describe, expect, it } from "vitest";
import { CASE_TYPES } from "@/config/company/case-types";
import {
  BAIL_CASE_STAGES,
  CIBIL_CASE_STAGES,
  CIVIL_APPEAL_CASE_STAGES,
  CONSUMER_CASE_STAGES,
  CRIMINAL_APPEAL_CASE_STAGES,
  CRIMINAL_CASE_STAGES,
  EXECUTION_CASE_STAGES,
  FAMILY_CASE_STAGES,
  GENERAL_CASE_STAGES,
  getHearingPurposeOptionsForCaseType,
  getStageOptionsForCaseType,
  isKnownStageForCaseType,
  IA_CASE_STAGES,
  LABOUR_CASE_STAGES,
  MACT_CASE_STAGES,
  resolveCaseStageTrack,
  unmappedCaseTypes,
  WARRANT_CASE_STAGES,
  WRIT_CASE_STAGES,
} from "@/config/company/case-stages";

describe("case type coverage", () => {
  it("maps every CASE_TYPES value explicitly", () => {
    expect(unmappedCaseTypes()).toEqual([]);
    expect(CASE_TYPES.length).toBeGreaterThan(0);
  });
});

describe("frozen catalogs", () => {
  it("keeps criminal / cibil / general first and last steps unchanged", () => {
    expect(CRIMINAL_CASE_STAGES[0]?.value).toBe(
      "Legal notice / reply — Served"
    );
    expect(CRIMINAL_CASE_STAGES.at(-1)?.value).toBe("Appeal");
    expect(CIBIL_CASE_STAGES[0]?.value).toBe("Filing the suit / petition");
    expect(CIBIL_CASE_STAGES.at(-1)?.value).toBe(
      "Suit / petition miscellaneous"
    );
    expect(GENERAL_CASE_STAGES[0]?.value).toBe("Filing");
    expect(GENERAL_CASE_STAGES.at(-1)?.value).toBe("Disposed");
  });
});

describe("resolveCaseStageTrack", () => {
  it("maps suit / recovery types to cibil", () => {
    for (const t of ["OS", "CS", "CIBIL", "OP", "AS"]) {
      expect(resolveCaseStageTrack(t)).toBe("cibil");
    }
  });

  it("maps criminal complaint types to criminal", () => {
    for (const t of ["CC", "STC", "SC", "CRL.OP"]) {
      expect(resolveCaseStageTrack(t)).toBe("criminal");
    }
  });

  it("maps remaining types to dedicated tracks", () => {
    expect(resolveCaseStageTrack("EP")).toBe("execution");
    expect(resolveCaseStageTrack("WP")).toBe("writ");
    expect(resolveCaseStageTrack("WA")).toBe("writ");
    expect(resolveCaseStageTrack("CMA")).toBe("civil_appeal");
    expect(resolveCaseStageTrack("CRP")).toBe("civil_appeal");
    expect(resolveCaseStageTrack("IA")).toBe("ia");
    expect(resolveCaseStageTrack("CRL.A")).toBe("criminal_appeal");
    expect(resolveCaseStageTrack("CRL.RC")).toBe("criminal_appeal");
    expect(resolveCaseStageTrack("Bail")).toBe("bail");
    expect(resolveCaseStageTrack("NBW")).toBe("warrant");
    expect(resolveCaseStageTrack("HMOP")).toBe("family");
    expect(resolveCaseStageTrack("MC")).toBe("family");
    expect(resolveCaseStageTrack("MACT")).toBe("mact");
    expect(resolveCaseStageTrack("Consumer")).toBe("consumer");
    expect(resolveCaseStageTrack("Labour")).toBe("labour");
    expect(resolveCaseStageTrack("Other")).toBe("general");
    expect(resolveCaseStageTrack("")).toBe("general");
    expect(resolveCaseStageTrack(null)).toBe("general");
  });
});

describe("getStageOptionsForCaseType", () => {
  it("returns the correct non-empty catalog per type", () => {
    expect(getStageOptionsForCaseType("CC")).toEqual(CRIMINAL_CASE_STAGES);
    expect(getStageOptionsForCaseType("OS")).toEqual(CIBIL_CASE_STAGES);
    expect(getStageOptionsForCaseType("EP")).toEqual(EXECUTION_CASE_STAGES);
    expect(getStageOptionsForCaseType("WP")).toEqual(WRIT_CASE_STAGES);
    expect(getStageOptionsForCaseType("CMA")).toEqual(CIVIL_APPEAL_CASE_STAGES);
    expect(getStageOptionsForCaseType("IA")).toEqual(IA_CASE_STAGES);
    expect(getStageOptionsForCaseType("CRL.A")).toEqual(
      CRIMINAL_APPEAL_CASE_STAGES
    );
    expect(getStageOptionsForCaseType("Bail")).toEqual(BAIL_CASE_STAGES);
    expect(getStageOptionsForCaseType("NBW")).toEqual(WARRANT_CASE_STAGES);
    expect(getStageOptionsForCaseType("HMOP")).toEqual(FAMILY_CASE_STAGES);
    expect(getStageOptionsForCaseType("MACT")).toEqual(MACT_CASE_STAGES);
    expect(getStageOptionsForCaseType("Consumer")).toEqual(CONSUMER_CASE_STAGES);
    expect(getStageOptionsForCaseType("Labour")).toEqual(LABOUR_CASE_STAGES);
    expect(getStageOptionsForCaseType("Other")).toEqual(GENERAL_CASE_STAGES);

    for (const t of CASE_TYPES) {
      const stages = getStageOptionsForCaseType(t.value);
      expect(stages.length).toBeGreaterThan(0);
    }
  });

  it("uses refined remaining-track board labels", () => {
    expect(EXECUTION_CASE_STAGES[0]?.value).toBe("Filing EP");
    expect(EXECUTION_CASE_STAGES.at(-1)?.value).toBe("Appeal / revision");
    expect(WRIT_CASE_STAGES[0]?.value).toBe("Filing writ petition / appeal");
    expect(BAIL_CASE_STAGES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "Order — bail granted" }),
        expect.objectContaining({ value: "Order — bail dismissed" }),
      ])
    );
    expect(WARRANT_CASE_STAGES[0]?.value).toBe(
      "NBW / bailable warrant issued"
    );
    expect(MACT_CASE_STAGES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "Claimant evidence (PW)" }),
        expect.objectContaining({ value: "Deposit by insurer" }),
      ])
    );
  });

  it("aligns hearing purposes with stage catalogs", () => {
    expect(getHearingPurposeOptionsForCaseType("CC")).toEqual(
      getStageOptionsForCaseType("CC")
    );
    expect(getHearingPurposeOptionsForCaseType("Bail")).toEqual(
      getStageOptionsForCaseType("Bail")
    );
  });
});

describe("isKnownStageForCaseType", () => {
  it("gates hearing→stage sync per track", () => {
    expect(isKnownStageForCaseType("Summon to accused", "CC")).toBe(true);
    expect(isKnownStageForCaseType("Summon to accused", "CIBIL")).toBe(false);
    expect(isKnownStageForCaseType("Issue to summon / batta", "OS")).toBe(true);
    expect(isKnownStageForCaseType("Admission", "WP")).toBe(true);
    expect(isKnownStageForCaseType("Order — bail granted", "Bail")).toBe(true);
    expect(isKnownStageForCaseType("Evidence", "Bail")).toBe(false);
    expect(isKnownStageForCaseType("Custom board note", "CC")).toBe(false);
  });
});
