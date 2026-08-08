import { describe, expect, it } from "vitest";
import {
  createExpenseFieldsSchema,
  updateExpenseSchema,
  voidExpenseSchema,
} from "@/lib/validations/expenses.schema";
import { EXPENSE_CATEGORIES } from "@/features/expenses/lib/categories";

describe("createExpenseFieldsSchema", () => {
  const base = {
    expenseDate: "2026-08-08",
    category: "stationery",
    vendor: "Local store",
    description: "A4 paper ream",
    amount: "250",
    paymentMode: "upi",
  };

  it("accepts a full valid create payload", () => {
    const parsed = createExpenseFieldsSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.amount).toBe(250);
      expect(parsed.data.paymentMode).toBe("upi");
      expect(parsed.data.expenseDate).toBeInstanceOf(Date);
    }
  });

  it("defaults empty payment mode to cash", () => {
    const parsed = createExpenseFieldsSchema.safeParse({
      ...base,
      paymentMode: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.paymentMode).toBe("cash");
  });

  it("rejects zero or negative amount", () => {
    expect(
      createExpenseFieldsSchema.safeParse({ ...base, amount: "0" }).success
    ).toBe(false);
    expect(
      createExpenseFieldsSchema.safeParse({ ...base, amount: "-10" }).success
    ).toBe(false);
  });

  it("rejects missing description", () => {
    expect(
      createExpenseFieldsSchema.safeParse({ ...base, description: "  " })
        .success
    ).toBe(false);
  });

  it("accepts every category including others", () => {
    for (const category of EXPENSE_CATEGORIES) {
      const parsed = createExpenseFieldsSchema.safeParse({
        ...base,
        category,
        description:
          category === "others" || category === "misc"
            ? "Courier packing materials"
            : base.description,
      });
      expect(parsed.success, category).toBe(true);
    }
  });

  it("requires a short note for Others / Miscellaneous", () => {
    const parsed = createExpenseFieldsSchema.safeParse({
      ...base,
      category: "others",
      description: "ab",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown category", () => {
    expect(
      createExpenseFieldsSchema.safeParse({
        ...base,
        category: "not_a_real_category",
      }).success
    ).toBe(false);
  });
});

describe("updateExpenseSchema", () => {
  it("allows partial update", () => {
    const parsed = updateExpenseSchema.safeParse({ amount: 99 });
    expect(parsed.success).toBe(true);
  });

  it("allows empty paymentMode to be omitted", () => {
    const parsed = updateExpenseSchema.safeParse({ paymentMode: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.paymentMode).toBeUndefined();
  });
});

describe("voidExpenseSchema", () => {
  it("requires a reason", () => {
    expect(voidExpenseSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(
      voidExpenseSchema.safeParse({ reason: "Entered twice" }).success
    ).toBe(true);
  });
});
