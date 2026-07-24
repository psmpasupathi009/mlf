import { describe, expect, it } from "vitest";
import {
  forgotPinResetSchema,
  loginSchema,
  pinSchema,
  setupPinSchema,
} from "@/lib/validations/auth.schema";
import { PIN_LENGTH } from "@/lib/auth/constants";

describe("pinSchema", () => {
  it(`accepts exactly ${PIN_LENGTH} digits`, () => {
    expect(pinSchema.safeParse("123456").success).toBe(true);
  });

  it("rejects short or non-digit PINs", () => {
    expect(pinSchema.safeParse("12345").success).toBe(false);
    expect(pinSchema.safeParse("1234567").success).toBe(false);
    expect(pinSchema.safeParse("12ab56").success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires mobile and pin", () => {
    expect(
      loginSchema.safeParse({ mobile: "9876543210", pin: "123456" }).success
    ).toBe(true);
    expect(loginSchema.safeParse({ mobile: "123", pin: "123456" }).success).toBe(
      false
    );
  });
});

describe("setupPinSchema / forgotPinResetSchema", () => {
  const token = "a".repeat(20);

  it("requires matching confirm PIN", () => {
    expect(
      setupPinSchema.safeParse({
        pin: "123456",
        confirmPin: "123456",
        otpProofToken: token,
      }).success
    ).toBe(true);
    expect(
      setupPinSchema.safeParse({
        pin: "123456",
        confirmPin: "654321",
        otpProofToken: token,
      }).success
    ).toBe(false);
  });

  it("forgot reset also requires matching PINs", () => {
    expect(
      forgotPinResetSchema.safeParse({
        pin: "111111",
        confirmPin: "222222",
        otpProofToken: token,
      }).success
    ).toBe(false);
  });
});
