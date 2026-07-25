import { describe, expect, it } from "vitest";
import { istDayBounds, parseIstDateInput } from "@/lib/utils/ist";

describe("parseIstDateInput", () => {
  it("parses YYYY-MM-DD as IST day start", () => {
    const d = parseIstDateInput("2024-06-15");
    expect(d).toEqual(istDayBounds("2024-06-15").start);
  });

  it("accepts Date instances", () => {
    const input = new Date("2024-06-15T10:00:00.000Z");
    expect(parseIstDateInput(input)?.toISOString()).toBe(input.toISOString());
  });

  it("returns null for empty or invalid", () => {
    expect(parseIstDateInput("")).toBeNull();
    expect(parseIstDateInput("not-a-date")).toBeNull();
  });
});
