import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { sendTransactionalSms } from "@/lib/services/two-factor.service";
import { smsTemplates } from "@/config/company/sms-templates";
import {
  istDateKey,
  istDayBounds,
  istDisplayDate,
  istAddCalendarDays,
} from "@/lib/utils/ist";

export type HearingSmsDetail = {
  hearingUnitId: string;
  caseUnitId: string;
  ok: boolean;
  message: string;
};

export type HearingSmsJobResult = {
  date: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  details: HearingSmsDetail[];
};

const CLOSED_CASE_STATUSES = new Set(["disposed", "withdrawn", "transferred", "archived"]);

/**
 * Day-before hearing SMS to clients only (2Factor transactional).
 * Skips adjourned, already-sent, opted-out, and closed cases.
 */
export async function runHearingSmsJob(): Promise<HearingSmsJobResult> {
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
  let skipped = 0;
  const details: HearingSmsDetail[] = [];

  if (dueHearings.length === 0) {
    await writeAudit({
      action: "cron.hearing_sms",
      entity: "Hearing",
      meta: { tomorrowKey, total: 0, sent: 0, failed: 0, skipped: 0 },
    });
    return {
      date: tomorrowKey,
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };
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

      if (CLOSED_CASE_STATUSES.has(caseItem.status)) {
        skipped++;
        await prisma.hearing.update({
          where: { id: hearing.id },
          data: { smsSentAt: new Date() },
        });
        details.push({
          hearingUnitId: hearing.unitId,
          caseUnitId: hearing.caseUnitId,
          ok: true,
          message: `Skipped — case ${caseItem.status}`,
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
        skipped++;
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

      if (result.ok) {
        await prisma.hearing.update({
          where: { id: hearing.id },
          data: { smsSentAt: new Date() },
        });
        sent++;
      } else {
        failed++;
      }
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
    meta: {
      tomorrowKey,
      total: dueHearings.length,
      sent,
      failed,
      skipped,
    },
  });

  return {
    date: tomorrowKey,
    total: dueHearings.length,
    sent,
    failed,
    skipped,
    details,
  };
}
