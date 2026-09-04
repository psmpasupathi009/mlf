import type { Hearing } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { sendTransactionalSms } from "@/lib/services/two-factor.service";
import { smsTemplates } from "@/config/company/sms-templates";
import { isWithinHearingSmsWindow } from "@/lib/hearings/sms-window";
import { notifyUser } from "@/lib/notifications/notify";
import { istDateKey, istDayBounds, istDisplayDate } from "@/lib/utils/ist";

export type HearingSmsDetail = {
  hearingUnitId: string;
  caseUnitId: string;
  ok: boolean;
  message: string;
};

export type HearingSmsJobResult = {
  /** IST calendar day the job ran for (send day). */
  date: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  /** True when more due hearings remain (batch capped for serverless time). */
  hasMore: boolean;
  details: HearingSmsDetail[];
  /** Set when cron gated on HEARING_SMS_TIME_IST and current time is outside the window. */
  skippedReason?: "outside_window";
};

export type RunHearingSmsJobOptions = {
  /** When true, no-op unless current IST time is inside HEARING_SMS_TIME_IST window. */
  respectEnvWindow?: boolean;
};

const CLOSED_CASE_STATUSES = new Set([
  "disposed",
  "withdrawn",
  "transferred",
  "archived",
]);
/** Cap per invocation so Vercel cron stays within maxDuration. */
const BATCH_SIZE = 80;
const SEND_CONCURRENCY = 5;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

type RowResult = {
  sent: number;
  failed: number;
  skipped: number;
  detail: HearingSmsDetail;
};

/** Pending upcoming hearings not yet SMS'd (any future/today hearing date). */
export function pendingHearingSmsWhere(todayStart: Date) {
  return {
    smsSentAt: null as null,
    isAdjourned: false,
    hearingDate: { gte: todayStart },
  };
}

async function notifyClientHearingReminder(input: {
  clientUnitId: string;
  caseUnitId: string;
  caseLabel: string;
  hearingDateIst: string;
  courtName: string;
}) {
  const portalUser = await prisma.user.findUnique({
    where: { clientUnitId: input.clientUnitId },
    select: { id: true, unitId: true, roles: true, isActive: true },
  });
  if (
    !portalUser?.isActive ||
    !portalUser.roles.length ||
    !portalUser.roles.every((r) => r === "client")
  ) {
    return;
  }
  await notifyUser({
    userId: portalUser.id,
    userUnitId: portalUser.unitId,
    type: "hearing_reminder",
    title: `Hearing on ${input.hearingDateIst}`,
    body: `Hearing for ${input.caseLabel} is on ${input.hearingDateIst} at ${input.courtName}.`,
    href: `/cases/${input.caseUnitId}`,
    meta: {
      caseUnitId: input.caseUnitId,
      hearingDateIst: input.hearingDateIst,
    },
  });
}

async function processHearingSmsBatch(
  dueHearings: Hearing[]
): Promise<Omit<HearingSmsJobResult, "date" | "hasMore" | "skippedReason">> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const details: HearingSmsDetail[] = [];

  if (dueHearings.length === 0) {
    return { total: 0, sent: 0, failed: 0, skipped: 0, details: [] };
  }

  const caseIds = Array.from(new Set(dueHearings.map((h) => h.caseId)));
  const cases = await prisma.case.findMany({
    where: { id: { in: caseIds } },
    select: {
      id: true,
      unitId: true,
      clientId: true,
      clientUnitId: true,
      status: true,
      caseNumber: true,
      courtName: true,
    },
  });
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const clientIds = Array.from(new Set(cases.map((c) => c.clientId)));
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: {
      id: true,
      unitId: true,
      name: true,
      mobile: true,
      smsConsent: true,
    },
  });
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const rowResults = await mapPool(
    dueHearings,
    SEND_CONCURRENCY,
    async (hearing): Promise<RowResult> => {
      try {
        const caseItem = caseById.get(hearing.caseId);
        if (!caseItem) {
          return {
            sent: 0,
            failed: 1,
            skipped: 0,
            detail: {
              hearingUnitId: hearing.unitId,
              caseUnitId: hearing.caseUnitId,
              ok: false,
              message: "Case not found",
            },
          };
        }

        if (CLOSED_CASE_STATUSES.has(caseItem.status)) {
          await prisma.hearing.update({
            where: { id: hearing.id },
            data: { smsSentAt: new Date() },
          });
          return {
            sent: 0,
            failed: 0,
            skipped: 1,
            detail: {
              hearingUnitId: hearing.unitId,
              caseUnitId: hearing.caseUnitId,
              ok: true,
              message: `Skipped — case ${caseItem.status}`,
            },
          };
        }

        const client = clientById.get(caseItem.clientId);
        if (!client) {
          return {
            sent: 0,
            failed: 1,
            skipped: 0,
            detail: {
              hearingUnitId: hearing.unitId,
              caseUnitId: hearing.caseUnitId,
              ok: false,
              message: "Client not found",
            },
          };
        }

        if (client.smsConsent === false) {
          await prisma.hearing.update({
            where: { id: hearing.id },
            data: { smsSentAt: new Date() },
          });
          return {
            sent: 0,
            failed: 0,
            skipped: 1,
            detail: {
              hearingUnitId: hearing.unitId,
              caseUnitId: hearing.caseUnitId,
              ok: true,
              message: "Skipped — client opted out of SMS",
            },
          };
        }

        const mobile = normalizeMobile(client.mobile) ?? client.mobile;
        const hearingDateIst = istDisplayDate(hearing.hearingDate);
        const caseLabel = caseItem.caseNumber ?? caseItem.unitId;
        const courtName = caseItem.courtName ?? "the court";
        const message = smsTemplates.hearingReminder({
          clientName: client.name,
          caseLabel,
          hearingDateIst,
          courtName,
        });

        // Claim before send so cron + manual cannot double-SMS.
        const claimAt = new Date();
        const claimed = await prisma.hearing.updateMany({
          where: { id: hearing.id, smsSentAt: null },
          data: { smsSentAt: claimAt },
        });
        if (claimed.count !== 1) {
          return {
            sent: 0,
            failed: 0,
            skipped: 1,
            detail: {
              hearingUnitId: hearing.unitId,
              caseUnitId: hearing.caseUnitId,
              ok: true,
              message: "Skipped — already claimed by another worker",
            },
          };
        }

        const result = await sendTransactionalSms(mobile, message);

        if (result.ok) {
          try {
            await notifyClientHearingReminder({
              clientUnitId: client.unitId,
              caseUnitId: caseItem.unitId,
              caseLabel,
              hearingDateIst,
              courtName,
            });
          } catch {
            /* SMS succeeded; portal notify is best-effort */
          }
          return {
            sent: 1,
            failed: 0,
            skipped: 0,
            detail: {
              hearingUnitId: hearing.unitId,
              caseUnitId: hearing.caseUnitId,
              ok: true,
              message: result.details,
            },
          };
        }

        // Allow retry on the next run.
        await prisma.hearing.update({
          where: { id: hearing.id },
          data: { smsSentAt: null },
        });

        return {
          sent: 0,
          failed: 1,
          skipped: 0,
          detail: {
            hearingUnitId: hearing.unitId,
            caseUnitId: hearing.caseUnitId,
            ok: false,
            message: result.details,
          },
        };
      } catch (error) {
        return {
          sent: 0,
          failed: 1,
          skipped: 0,
          detail: {
            hearingUnitId: hearing.unitId,
            caseUnitId: hearing.caseUnitId,
            ok: false,
            message: error instanceof Error ? error.message : "Unknown error",
          },
        };
      }
    }
  );

  for (const r of rowResults) {
    sent += r.sent;
    failed += r.failed;
    skipped += r.skipped;
    details.push(r.detail);
  }

  return {
    total: dueHearings.length,
    sent,
    failed,
    skipped,
    details,
  };
}

/**
 * Pending-list hearing SMS + client in-app notify (2Factor transactional).
 * Selects upcoming hearings with smsSentAt null (any hearing date ≥ today IST).
 * Once sent, smsSentAt blocks repeats — including on the hearing day.
 */
export async function runHearingSmsJob(
  options: RunHearingSmsJobOptions = {}
): Promise<HearingSmsJobResult> {
  const sendDayKey = istDateKey();
  const empty = (): HearingSmsJobResult => ({
    date: sendDayKey,
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    hasMore: false,
    details: [],
  });

  if (options.respectEnvWindow && !isWithinHearingSmsWindow()) {
    return { ...empty(), skippedReason: "outside_window" };
  }

  const { start: todayStart } = istDayBounds(sendDayKey);
  const where = pendingHearingSmsWhere(todayStart);

  const dueTotal = await prisma.hearing.count({ where });

  const dueHearings = await prisma.hearing.findMany({
    where,
    orderBy: { hearingDate: "asc" },
    take: BATCH_SIZE,
  });

  const hasMore = dueTotal > dueHearings.length;
  const batch = await processHearingSmsBatch(dueHearings);

  await writeAudit({
    action: "cron.hearing_sms",
    entity: "Hearing",
    meta: {
      sendDayKey,
      total: batch.total,
      dueTotal,
      sent: batch.sent,
      failed: batch.failed,
      skipped: batch.skipped,
      hasMore,
      respectEnvWindow: Boolean(options.respectEnvWindow),
    },
  });

  return {
    date: sendDayKey,
    ...batch,
    hasMore,
  };
}

/**
 * Send client SMS for specific hearings (force / tools). Claim-then-send; safe to call twice.
 * Prefer the daily ENV pending-list job for normal office flow.
 */
export async function sendHearingSmsForUnitIds(
  unitIds: string[]
): Promise<Omit<HearingSmsJobResult, "date" | "hasMore" | "skippedReason">> {
  const unique = [...new Set(unitIds.filter(Boolean))];
  if (unique.length === 0) {
    return { total: 0, sent: 0, failed: 0, skipped: 0, details: [] };
  }

  const dueHearings = await prisma.hearing.findMany({
    where: {
      unitId: { in: unique },
      smsSentAt: null,
      isAdjourned: false,
    },
    orderBy: { hearingDate: "asc" },
    take: BATCH_SIZE,
  });

  const batch = await processHearingSmsBatch(dueHearings);

  if (batch.total > 0) {
    await writeAudit({
      action: "hearing.sms_import_catchup",
      entity: "Hearing",
      meta: {
        requested: unique.length,
        total: batch.total,
        sent: batch.sent,
        failed: batch.failed,
        skipped: batch.skipped,
      },
    });
  }

  return batch;
}
