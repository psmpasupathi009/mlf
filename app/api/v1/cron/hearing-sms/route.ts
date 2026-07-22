import { timingSafeEqual } from "crypto";
import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { sendTransactionalSms } from "@/lib/services/two-factor.service";
import { smsTemplates } from "@/config/company/sms-templates";
import { istDateKey, istDayBounds, istDisplayDate, istAddCalendarDays } from "@/lib/utils/ist";

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Day-before hearing SMS reminders (IST calendar day).
 * Trigger via an external scheduler (e.g. Vercel Cron) once daily:
 *   POST /api/v1/cron/hearing-sms  with header  x-cron-secret: <CRON_SECRET>
 */
export const POST = apiHandler(async (request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonFail("SERVER_ERROR", "CRON_SECRET is not configured", 500);
  }
  const provided = request.headers.get("x-cron-secret");
  if (!provided || !secretsEqual(provided, secret)) {
    return jsonFail("UNAUTHORIZED", "Unauthorized", 401);
  }

  const tomorrowKey = istAddCalendarDays(istDateKey(), 1);
  const { start, end } = istDayBounds(tomorrowKey);

  const dueHearings = await prisma.hearing.findMany({
    where: {
      smsSentAt: null,
      isAdjourned: false,
      hearingDate: { gte: start, lte: end },
    },
    orderBy: { hearingDate: "asc" },
    take: 500,
  });

  let sent = 0;
  let failed = 0;
  const details: { hearingUnitId: string; caseUnitId: string; ok: boolean; message: string }[] = [];

  if (dueHearings.length === 0) {
    await writeAudit({
      action: "cron.hearing_sms",
      entity: "Hearing",
      meta: { tomorrowKey, total: 0, sent: 0, failed: 0 },
    });
    return jsonOk({ date: tomorrowKey, total: 0, sent: 0, failed: 0, details: [] });
  }

  const caseIds = Array.from(new Set(dueHearings.map((h) => h.caseId)));
  const cases = await prisma.case.findMany({ where: { id: { in: caseIds } } });
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const clientIds = Array.from(new Set(cases.map((c) => c.clientId)));
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
  });
  const clientById = new Map(clients.map((c) => [c.id, c]));

  for (const hearing of dueHearings) {
    try {
      const caseItem = caseById.get(hearing.caseId);
      if (!caseItem) {
        failed++;
        details.push({
          hearingUnitId: hearing.unitId,
          caseUnitId: hearing.caseUnitId,
          ok: false,
          message: "Case not found",
        });
        continue;
      }
      const client = clientById.get(caseItem.clientId);
      if (!client) {
        failed++;
        details.push({
          hearingUnitId: hearing.unitId,
          caseUnitId: hearing.caseUnitId,
          ok: false,
          message: "Client not found",
        });
        continue;
      }

      if (client.smsConsent === false) {
        // Mark skipped so cron doesn't retry the same opt-out forever.
        await prisma.hearing.update({
          where: { id: hearing.id },
          data: { smsSentAt: new Date() },
        });
        details.push({
          hearingUnitId: hearing.unitId,
          caseUnitId: hearing.caseUnitId,
          ok: true,
          message: "Skipped — client opted out of SMS",
        });
        continue;
      }

      const mobile = normalizeMobile(client.mobile) ?? client.mobile;
      const message = smsTemplates.hearingReminder({
        clientName: client.name,
        caseLabel: caseItem.caseNumber ?? caseItem.unitId,
        hearingDateIst: istDisplayDate(hearing.hearingDate),
        courtName: caseItem.courtName ?? "the court",
      });

      const result = await sendTransactionalSms(mobile, message);

      await prisma.hearing.update({
        where: { id: hearing.id },
        data: { smsSentAt: result.ok ? new Date() : undefined },
      });

      if (result.ok) sent++;
      else failed++;
      details.push({
        hearingUnitId: hearing.unitId,
        caseUnitId: hearing.caseUnitId,
        ok: result.ok,
        message: result.details,
      });
    } catch (error) {
      failed++;
      details.push({
        hearingUnitId: hearing.unitId,
        caseUnitId: hearing.caseUnitId,
        ok: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  await writeAudit({
    action: "cron.hearing_sms",
    entity: "Hearing",
    meta: { tomorrowKey, total: dueHearings.length, sent, failed },
  });

  return jsonOk({ date: tomorrowKey, total: dueHearings.length, sent, failed, details });
});
