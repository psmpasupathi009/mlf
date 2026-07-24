import { apiHandler, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { runHearingSmsJob } from "@/lib/services/hearing-sms.job";
import { writeAudit } from "@/lib/audit";
import {
  findUsersByRoles,
  notifyUsers,
  scheduleNotify,
} from "@/lib/notifications/notify";

/** Staff trigger: send tomorrow's client hearing SMS now (same job as cron). */
export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "edit");
  if (!user) return response;

  const result = await runHearingSmsJob();

  await writeAudit({
    actorUnitId: user.unitId,
    action: "hearing.sms_manual",
    entity: "Hearing",
    meta: {
      date: result.date,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      total: result.total,
    },
  });

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
          source: "manual",
          actorUnitId: user.unitId,
        },
      }))
    );
  });

  return jsonOk(result);
});
