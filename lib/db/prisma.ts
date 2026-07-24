import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function databaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  // Fail fast when Atlas is unreachable (default selection wait is ~30s).
  if (/serverSelectionTimeoutMS=/i.test(base)) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}serverSelectionTimeoutMS=5000`;
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
    void existing.$disconnect().catch(() => undefined);
  }
  const next = createClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = next;
  }
  return next;
}

export const prisma = resolveClient();

export type {
  User,
  UserRole,
  OtpPurpose,
  OtpSession,
  RefreshToken,
} from "@prisma/client";
