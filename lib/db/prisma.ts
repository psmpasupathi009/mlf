import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Append `key=value` only when the param is not already present. */
function appendQueryParam(url: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`, "i").test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${value}`;
}

/**
 * Serverless-friendly Mongo defaults for Vercel + Atlas:
 * - fail fast on unreachable clusters (not ~30s)
 * - small pool per isolate (many concurrent lambdas)
 * - release idle sockets so frozen isolates do not hold connections forever
 */
export function buildMongoDatabaseUrl(base: string): string {
  let url = base;
  url = appendQueryParam(url, "serverSelectionTimeoutMS", "5000");
  url = appendQueryParam(url, "connectTimeoutMS", "10000");
  url = appendQueryParam(url, "maxPoolSize", "10");
  url = appendQueryParam(url, "minPoolSize", "0");
  url = appendQueryParam(url, "maxIdleTimeMS", "30000");
  return url;
}

function databaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  return buildMongoDatabaseUrl(base);
}

function createClient() {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * After `prisma generate`, Next.js can keep a stale global client missing new
 * delegates (e.g. officeHoliday). Drop and recreate when required models lack.
 */
function clientHasRequiredModels(client: PrismaClient): boolean {
  const c = client as unknown as Record<string, unknown>;
  return (
    typeof c.officeHoliday === "object" &&
    c.officeHoliday != null &&
    typeof c.notification === "object" &&
    c.notification != null &&
    typeof c.dakEntry === "object" &&
    c.dakEntry != null &&
    typeof c.officeTask === "object" &&
    c.officeTask != null
  );
}

function resolveClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && clientHasRequiredModels(existing)) return existing;
  if (existing) {
    // Only disconnect when replacing a broken/stale client — never after each request.
    globalForPrisma.prisma = undefined;
    void existing.$disconnect().catch(() => undefined);
  }
  const next = createClient();
  // Eager connect so the first query after HMR/recreate does not race
  // "Engine is not yet connected". Keep the client warm on the isolate.
  void next.$connect().catch(() => undefined);
  globalForPrisma.prisma = next;
  return next;
}

export const prisma = resolveClient();

// Prefer specific connection failures — avoid bare "timeout" (e.g. OTP messages).
const UNREACHABLE_RE =
  /server selection|serverselection|econnrefused|econnreset|enotfound|etimedout|(?:connection|socket|server|operation|network)\s+timed?\s*out|timed\s+out|connect(?:ion)? (?:refused|reset|failed|closed)|noprimary|no primary|replicasetnoprimary|replica set|mongodb.*(connect|network)|engine is not yet connected|prisma.?client.?initialization|can't reach database|could not connect|tlsv1 alert internal error|fatal alert:\s*internalerror|internalerror/i;

/** True when Mongo/Atlas is unreachable or the engine is not ready yet. */
export function isDbUnreachableError(error: unknown): boolean {
  if (error == null) return false;
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error);
  return UNREACHABLE_RE.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry transient Atlas / cold-start connection failures.
 * Use only for idempotent or read-mostly work — not non-idempotent writes.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isDbUnreachableError(error) || i === attempts - 1) throw error;
      await sleep(120 * 2 ** i);
    }
  }
  throw last;
}

export type {
  User,
  UserRole,
  OtpPurpose,
  OtpSession,
} from "@prisma/client";
