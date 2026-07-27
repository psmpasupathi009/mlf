import { describe, expect, it, vi } from "vitest";
import {
  buildMongoDatabaseUrl,
  isDbUnreachableError,
  withDbRetry,
} from "@/lib/db/prisma";

describe("buildMongoDatabaseUrl", () => {
  it("appends serverless Mongo defaults", () => {
    const url = buildMongoDatabaseUrl("mongodb+srv://u:p@cluster/mlf");
    expect(url).toContain("serverSelectionTimeoutMS=5000");
    expect(url).toContain("connectTimeoutMS=10000");
    expect(url).toContain("maxPoolSize=10");
    expect(url).toContain("minPoolSize=0");
    expect(url).toContain("maxIdleTimeMS=30000");
  });

  it("does not override existing query params", () => {
    const url = buildMongoDatabaseUrl(
      "mongodb://127.0.0.1:27017/mlf?maxPoolSize=20&serverSelectionTimeoutMS=2000"
    );
    expect(url).toContain("maxPoolSize=20");
    expect(url).not.toMatch(/maxPoolSize=10/);
    expect(url).toContain("serverSelectionTimeoutMS=2000");
    expect(url).not.toMatch(/serverSelectionTimeoutMS=5000/);
    expect(url).toContain("connectTimeoutMS=10000");
  });

  it("preserves query separator when base already has params", () => {
    const url = buildMongoDatabaseUrl("mongodb://127.0.0.1:27017/mlf?authSource=admin");
    expect(url.startsWith("mongodb://127.0.0.1:27017/mlf?authSource=admin&")).toBe(
      true
    );
  });
});

describe("isDbUnreachableError", () => {
  it("detects Atlas / selection failures", () => {
    expect(
      isDbUnreachableError(
        new Error("Server selection timeout: No available servers")
      )
    ).toBe(true);
    expect(
      isDbUnreachableError(new Error("connect ECONNREFUSED 127.0.0.1:27017"))
    ).toBe(true);
    expect(isDbUnreachableError(new Error("Engine is not yet connected"))).toBe(
      true
    );
    expect(
      isDbUnreachableError(new Error("MongoServerSelectionError: timed out"))
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
