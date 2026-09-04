import { timingSafeEqual } from "crypto";
import { jsonFail } from "@/lib/api/response";

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Authorize Vercel / manual cron callers.
 * Accepts `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`.
 * Returns a Response to send when denied; null when allowed.
 */
export function authorizeCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonFail("SERVER_ERROR", "CRON_SECRET is not configured", 500);
  }
  const header =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!header || !secretsEqual(header, secret)) {
    return jsonFail("UNAUTHORIZED", "Unauthorized", 401);
  }
  return null;
}
