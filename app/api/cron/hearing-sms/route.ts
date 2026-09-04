import { apiHandler, jsonOk } from "@/lib/api/response";
import { authorizeCron } from "@/lib/api/cron-auth";
import { runHearingSmsJob } from "@/lib/services/hearing-sms.job";
import {
  findUsersByRoles,
  notifyUsers,
  scheduleNotify,
} from "@/lib/notifications/notify";

/** Vercel Hobby/Pro: allow longer cron runs for SMS batches. */
export const maxDuration = 300;

/**
 * Pending-list hearing SMS + client notify at HEARING_SMS_TIME_IST.
 * Vercel Cron every 15m; job no-ops outside the ENV window.
 * Auth: Authorization: Bearer <CRON_SECRET> or x-cron-secret.
 */
async function handleCron(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const result = await runHearingSmsJob({ respectEnvWindow: true });

  if (result.skippedReason !== "outside_window") {
    scheduleNotify(async () => {
      const admins = await findUsersByRoles(["admin", "sub_admin"]);
      const title = `Hearing SMS: ${result.sent} sent for ${result.date}`;
      const more = result.hasMore ? " · more pending" : "";
      const body = `Total ${result.total} · failed ${result.failed} · skipped ${result.skipped}${more}`;
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
            hasMore: result.hasMore,
            source: "cron",
          },
        }))
      );
    });
  }

  return jsonOk(result);
}

export const GET = apiHandler(async (request) => handleCron(request));
export const POST = apiHandler(async (request) => handleCron(request));
