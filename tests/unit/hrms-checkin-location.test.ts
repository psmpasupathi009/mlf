import { describe, expect, it } from "vitest";
import { checkInOutSchema } from "@/lib/validations/hrms.schema";

describe("checkInOutSchema location", () => {
  it("accepts valid coords and accuracy", () => {
    const parsed = checkInOutSchema.safeParse({
      latitude: 11.45,
      longitude: 77.43,
      accuracy: 25,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.accuracy).toBe(25);
    }
  });

  it("drops Infinity / NaN / oversized accuracy instead of failing punch", () => {
    for (const accuracy of [Infinity, NaN, 60_000, null]) {
      const parsed = checkInOutSchema.safeParse({
        latitude: 11.45,
        longitude: 77.43,
        accuracy,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.accuracy).toBeUndefined();
      }
    }
  });

  it("coerces string lat/lng from clients", () => {
    const parsed = checkInOutSchema.safeParse({
      latitude: "11.45",
      longitude: "77.43",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.latitude).toBe(11.45);
      expect(parsed.data.longitude).toBe(77.43);
    }
  });
});
