import { prisma, withDbRetry } from "@/lib/db/prisma";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
};

/**
 * Mongo-backed rate limit (works across instances).
 * Uses conditional increment to reduce check-then-update races.
 * Retries only on unreachable-DB errors (success path is not re-run).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  return withDbRetry(async () => {
    const now = new Date();

    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    if (!existing || existing.resetAt.getTime() <= now.getTime()) {
      const resetAt = new Date(now.getTime() + windowMs);
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return { allowed: true, retryAfterSec: 0 };
    }

    if (existing.count >= limit) {
      return {
        allowed: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000)
        ),
      };
    }

    // Conditional increment — only succeeds while still under the limit.
    const bumped = await prisma.rateLimit.updateMany({
      where: {
        key,
        count: { lt: limit },
        resetAt: { gt: now },
      },
      data: { count: { increment: 1 } },
    });

    if (bumped.count === 0) {
      const latest = await prisma.rateLimit.findUnique({ where: { key } });
      return {
        allowed: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil(
            ((latest?.resetAt.getTime() ?? now.getTime()) - now.getTime()) / 1000
          )
        ),
      };
    }

    return { allowed: true, retryAfterSec: 0 };
  });
}
