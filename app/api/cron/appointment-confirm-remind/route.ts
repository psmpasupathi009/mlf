import { apiHandler, jsonOk } from "@/lib/api/response";
import { authorizeCron } from "@/lib/api/cron-auth";
import { runAppointmentConfirmRemindJob } from "@/lib/services/appointment-confirm-remind.job";

/** Allow enough time for a batch of in-app notifications. */
export const maxDuration = 60;

/**
 * When confirm-coming window opens, notify client portal + advocate once.
 * Vercel Cron: GET /api/cron/appointment-confirm-remind
 * Manual / external: POST with Authorization: Bearer <CRON_SECRET> or x-cron-secret
 */
async function handleCron(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  return jsonOk(await runAppointmentConfirmRemindJob());
}

export const GET = apiHandler(async (request) => handleCron(request));
export const POST = apiHandler(async (request) => handleCron(request));
