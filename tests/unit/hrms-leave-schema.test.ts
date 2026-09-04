import { describe, expect, it } from "vitest";
import { applyLeaveSchema } from "@/lib/validations/hrms.schema";
import { istDateKey } from "@/lib/utils/ist";

describe("applyLeaveSchema", () => {
  it("rejects leave starting in the past", () => {
    const parsed = applyLeaveSchema.safeParse({
      fromDate: "2020-01-01",
      toDate: "2020-01-02",
      reason: "Travel",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts leave starting today", () => {
    const today = istDateKey();
    const parsed = applyLeaveSchema.safeParse({
      fromDate: today,
      toDate: today,
      reason: "Personal",
    });
    expect(parsed.success).toBe(true);
  });
});
