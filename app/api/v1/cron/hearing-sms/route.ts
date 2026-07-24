import { timingSafeEqual } from "crypto";
import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { runHearingSmsJob } from "@/lib/services/hearing-sms.job";
import {
  findUsersByRoles,
  notifyUsers,
  scheduleNotify,
} from "@/lib/notifications/notify";

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
  const urlSecret = new URL(request.url).searchParams.get("secret") ?? "";
  const provided = header || urlSecret;
  if (!provided || !secretsEqual(provided, secret)) {
    return jsonFail("UNAUTHORIZED", "Unauthorized", 401);
  }
  return null;
}

/**
 * Day-before hearing SMS reminders (IST).
 * Vercel Cron: GET /api/v1/cron/hearing-sms (secret via x-cron-secret or ?secret=)
 * Manual / external: POST with header x-cron-secret: <CRON_SECRET>
 */
async function handleCron(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const result = await runHearingSmsJob();

  scheduleNotify(async () => {
    const admins = await findUsersByRoles(["admin", "sub_admin"]);
    const title = `Hearing SMS: ${result.sent} sent for ${result.date}`;
    const body = `Total ${result.total} · failed ${result.failed} · skipped ${result.skipped}`;
    await notifyUsers(
      admins.map((u) => ({
        userId: u.id,
        userUnitId: u.unitId,
        type: "system",
        title,
        body,
        href: "/diary",
        meta: {
          date: result.date,
          sent: result.sent,
          failed: result.failed,
          skipped: result.skipped,
          total: result.total,
          source: "cron",
        },
      }))
    );
  });

  return jsonOk(result);
}

export const GET = apiHandler(async (request) => handleCron(request));
export const POST = apiHandler(async (request) => handleCron(request));
