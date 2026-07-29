import { describe, expect, it, vi } from "vitest";
import {
  isDbUnreachableError,
  withDbRetry,
} from "@/lib/db/unreachable";

describe("isDbUnreachableError", () => {
  it("detects Atlas / selection failures", () => {
    expect(
      isDbUnreachableError(
        new Error("Server selection timeout: No available servers")
      )
    ).toBe(true);
    expect(
      isDbUnreachableError(new Error("connect ECONNREFUSED cluster.mongodb.net"))
    ).toBe(true);
    expect(isDbUnreachableError(new Error("Engine is not yet connected"))).toBe(
      true
    );
    expect(
      isDbUnreachableError(new Error("MongoServerSelectionError: timed out"))
    ).toBe(true);
    expect(
      isDbUnreachableError(
        new Error("I/O error: received fatal alert: InternalError")
      )
    ).toBe(true);
    expect(
      isDbUnreachableError(new Error("tlsv1 alert internal error"))
    ).toBe(true);
  });

  it("ignores normal application errors", () => {
    expect(isDbUnreachableError(new Error("Unique constraint failed"))).toBe(
      false
    );
    expect(isDbUnreachableError(new Error("OTP timeout expired"))).toBe(false);
    expect(isDbUnreachableError(null)).toBe(false);
  });
});

describe("withDbRetry", () => {
  it("retries unreachable errors then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server selection timeout"))
      .mockResolvedValueOnce("ok");

    await expect(withDbRetry(fn, 3)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-connection errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Unique constraint failed"));
    await expect(withDbRetry(fn, 3)).rejects.toThrow("Unique constraint");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts attempts then throws", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Server selection timeout"));
    await expect(withDbRetry(fn, 3)).rejects.toThrow("Server selection");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
