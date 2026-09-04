import { timingSafeEqual } from "crypto";
import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { runAppointmentConfirmRemindJob } from "@/lib/services/appointment-confirm-remind.job";

/** Allow enough time for a batch of in-app notifications. */
export const maxDuration = 60;

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorizeCron(request: Request): Response | null {
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

/**
 * When confirm-coming window opens, notify client portal + advocate once.
 * Vercel Cron: GET /api/cron/appointment-confirm-remind
 * Manual / external: POST with Authorization: Bearer <CRON_SECRET> or x-cron-secret
 */
async function handleCron(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const result = await runAppointmentConfirmRemindJob();
  return jsonOk(result);
}

export const GET = apiHandler(async (request) => handleCron(request));
export const POST = apiHandler(async (request) => handleCron(request));
