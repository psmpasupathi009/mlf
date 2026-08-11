import { describe, expect, it } from "vitest";
import {
  isStageAllowedForCaseType,
  resolveStageForSave,
} from "@/config/company/case-stages";
import {
  creatableStatusValues,
  editableStatusValues,
} from "@/config/company/case-pipeline";
import { buildCaseListWhere } from "@/features/cases/server/filters";

describe("isStageAllowedForCaseType", () => {
  it("allows empty stage", () => {
    expect(isStageAllowedForCaseType("", "CC")).toBe(true);
    expect(isStageAllowedForCaseType(null, "CC")).toBe(true);
  });

  it("allows criminal stage on CC", () => {
    expect(isStageAllowedForCaseType("Arguments", "CC")).toBe(true);
  });

  it("rejects CIBIL catalog stage on CC", () => {
    expect(
      isStageAllowedForCaseType("Filing the suit / petition", "CC")
    ).toBe(false);
  });

  it("allows genuine free-text", () => {
    expect(isStageAllowedForCaseType("Custom clerk note", "CC")).toBe(true);
  });
});

describe("resolveStageForSave", () => {
  it("rejects explicit cross-track stage", () => {
    const r = resolveStageForSave({
      nextStage: "Filing the suit / petition",
      nextCaseType: "CC",
      prevStage: null,
      prevCaseType: null,
      stageProvided: true,
      caseTypeProvided: true,
    });
    expect(r.ok).toBe(false);
  });

  it("clears incompatible stage when only caseType changes", () => {
    const r = resolveStageForSave({
      nextStage: undefined,
      nextCaseType: "CC",
      prevStage: "Filing the suit / petition",
      prevCaseType: "OS",
      stageProvided: false,
      caseTypeProvided: true,
    });
    expect(r).toEqual({ ok: true, stage: null });
  });

  it("keeps compatible stage on type change", () => {
    const r = resolveStageForSave({
      nextStage: undefined,
      nextCaseType: "STC",
      prevStage: "Arguments",
      prevCaseType: "CC",
      stageProvided: false,
      caseTypeProvided: true,
    });
    expect(r).toEqual({ ok: true, stage: "Arguments" });
  });
});

describe("editableStatusValues", () => {
  it("includes current and allowed transitions only", () => {
    const vals = editableStatusValues("enquiry");
    expect(vals).toContain("enquiry");
    expect(vals).toContain("engaged");
    expect(vals).toContain("withdrawn");
    expect(vals).not.toContain("disposed");
  });
});

describe("creatableStatusValues", () => {
  it("only allows enquiry on create", () => {
    expect(creatableStatusValues()).toEqual(["enquiry"]);
  });
});

describe("buildCaseListWhere caseType", () => {
  it("filters by caseType", () => {
    const where = buildCaseListWhere({ caseType: "CC" });
    expect(where.caseType).toBe("CC");
  });
});
