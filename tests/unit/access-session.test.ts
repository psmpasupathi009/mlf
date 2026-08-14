import { describe, expect, it } from "vitest";
import { accessSessionMatches } from "@/lib/auth/jwt";

describe("accessSessionMatches", () => {
  it("treats missing JWT sv and missing DB version as a match (legacy sessions)", () => {
    expect(accessSessionMatches({}, undefined)).toBe(true);
    expect(accessSessionMatches({}, 0)).toBe(true);
    expect(accessSessionMatches({ sv: 0 }, null)).toBe(true);
  });

  it("rejects a token after sessionVersion bump (PIN reset)", () => {
    expect(accessSessionMatches({ sv: 0 }, 1)).toBe(false);
    expect(accessSessionMatches({}, 1)).toBe(false);
    expect(accessSessionMatches({ sv: 1 }, 1)).toBe(true);
  });
});
