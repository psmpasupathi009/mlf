import { describe, expect, it } from "vitest";
import {
  createOfficeTaskSchema,
  updateOfficeTaskSchema,
} from "@/lib/validations/tasks.schema";

describe("updateOfficeTaskSchema", () => {
  it("rejects empty finishNote when marking done", () => {
    const parsed = updateOfficeTaskSchema.safeParse({
      status: "done",
      finishNote: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("allows done with a non-empty finishNote", () => {
    const parsed = updateOfficeTaskSchema.safeParse({
      status: "done",
      finishNote: "Filed the papers",
    });
    expect(parsed.success).toBe(true);
  });

  it("allows done without finishNote in payload (existing note on server)", () => {
    const parsed = updateOfficeTaskSchema.safeParse({
      status: "done",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("createOfficeTaskSchema", () => {
  it("requires finishNote when creating as done", () => {
    const parsed = createOfficeTaskSchema.safeParse({
      title: "Finish bundle",
      status: "done",
    });
    expect(parsed.success).toBe(false);
  });
});
