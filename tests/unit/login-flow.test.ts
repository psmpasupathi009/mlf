import { describe, expect, it, afterEach } from "vitest";
import {
  bootstrapPinFromEnv,
  shouldAutoSetBootstrapPin,
} from "@/lib/auth/bootstrap-pin";
import { nextStepAfterCheckMobile } from "@/lib/auth/login-flow";

describe("bootstrap-pin", () => {
  const nodeEnv = process.env.NODE_ENV;
  const seedPin = process.env.SEED_PIN;

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    if (seedPin === undefined) delete process.env.SEED_PIN;
    else process.env.SEED_PIN = seedPin;
  });

  it("auto-sets bootstrap PIN in development", () => {
    process.env.NODE_ENV = "development";
    expect(shouldAutoSetBootstrapPin()).toBe(true);
  });

  it("skips auto PIN in production", () => {
    process.env.NODE_ENV = "production";
    expect(shouldAutoSetBootstrapPin()).toBe(false);
  });

  it("uses SEED_PIN when set", () => {
    process.env.SEED_PIN = "654321";
    expect(bootstrapPinFromEnv()).toBe("654321");
  });

  it("defaults bootstrap PIN to 123456", () => {
    delete process.env.SEED_PIN;
    expect(bootstrapPinFromEnv()).toBe("123456");
  });
});

describe("login-flow", () => {
  it("maps check-mobile status to steps", () => {
    expect(nextStepAfterCheckMobile("pin")).toBe("pin");
    expect(nextStepAfterCheckMobile("otp_required")).toBe("otp_setup");
    expect(nextStepAfterCheckMobile("not_found")).toBe("error");
    expect(nextStepAfterCheckMobile(undefined)).toBe("error");
  });
});
