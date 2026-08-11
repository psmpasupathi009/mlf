import { describe, expect, it } from "vitest";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "@/lib/validations/employees.schema";

const court = {
  state: "Tamil Nadu",
  district: "Erode",
  city: "Gobi",
  courtName: "JM No.I",
};

describe("createEmployeeSchema default courts", () => {
  it("requires at least one default court when role includes advocate", () => {
    const bad = createEmployeeSchema.safeParse({
      name: "Test Advocate",
      mobile: "9876502001",
      designation: "Advocate",
      roles: ["advocate"],
      defaultCourts: [],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0]?.message).toMatch(/default court/i);
    }
  });

  it("accepts advocate with a default court", () => {
    const ok = createEmployeeSchema.safeParse({
      name: "Test Advocate",
      mobile: "9876502001",
      designation: "Advocate",
      roles: ["advocate"],
      defaultCourts: [court],
    });
    expect(ok.success).toBe(true);
  });

  it("allows non-advocate without default courts", () => {
    const ok = createEmployeeSchema.safeParse({
      name: "Clerk",
      mobile: "9876502002",
      designation: "Court Clerk",
      roles: ["staff"],
    });
    expect(ok.success).toBe(true);
  });
});

describe("updateEmployeeSchema default courts", () => {
  it("warns via refine when advocate roles and empty courts are both set", () => {
    const bad = updateEmployeeSchema.safeParse({
      roles: ["advocate"],
      defaultCourts: [],
    });
    expect(bad.success).toBe(false);
  });
});
