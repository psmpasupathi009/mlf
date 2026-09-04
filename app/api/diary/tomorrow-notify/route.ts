import { apiHandler, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { displayMobile } from "@/lib/auth/mobile";
import { pendingHearingSmsWhere } from "@/lib/services/hearing-sms.job";
import { istDateKey, istDayBounds, istDisplayDate } from "@/lib/utils/ist";

/**
 * Pending / upcoming hearings for clerks (SMS + notify queue).
 * Same upcoming filter as the ENV-timed hearing-SMS job.
 */
export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "edit");
  if (!user) return response;

  const sendDayKey = istDateKey();
  const { start: todayStart } = istDayBounds(sendDayKey);
  const pendingWhere = pendingHearingSmsWhere(todayStart);

  const hearings = await prisma.hearing.findMany({
    where: {
      isAdjourned: false,
      hearingDate: { gte: todayStart },
    },
    orderBy: { hearingDate: "asc" },
    take: 200,
  });

  const smsPendingCount = await prisma.hearing.count({ where: pendingWhere });

  const caseUnitIds = [...new Set(hearings.map((h) => h.caseUnitId))];
  const cases = caseUnitIds.length
    ? await prisma.case.findMany({ where: { unitId: { in: caseUnitIds } } })
    : [];
  const caseMap = new Map(cases.map((c) => [c.unitId, c]));

  const clientUnitIds = [...new Set(cases.map((c) => c.clientUnitId))];
  const clients = clientUnitIds.length
    ? await prisma.client.findMany({
        where: { unitId: { in: clientUnitIds } },
      })
    : [];
  const clientMap = new Map(clients.map((c) => [c.unitId, c]));

  const items = hearings.map((h) => {
    const cse = caseMap.get(h.caseUnitId);
    const client = cse ? clientMap.get(cse.clientUnitId) : null;
    return {
      hearingUnitId: h.unitId,
      hearingDate: h.hearingDate.toISOString(),
      hearingDateLabel: istDisplayDate(h.hearingDate),
      purpose: h.purpose,
      smsSentAt: h.smsSentAt?.toISOString() ?? null,
      caseUnitId: h.caseUnitId,
      caseNumber: cse?.caseNumber ?? null,
      courtName: cse?.courtName ?? null,
      clientUnitId: client?.unitId ?? null,
      clientName: client?.name ?? null,
      clientMobile: client?.mobile ? displayMobile(client.mobile) : null,
      smsConsent: client?.smsConsent ?? null,
    };
  });

  const pendingSms = items.filter((i) => !i.smsSentAt);
  const withMobile = pendingSms.filter((i) => i.clientMobile);

  return jsonOk({
    date: sendDayKey,
    items,
    summary: {
      total: items.length,
      smsPending: smsPendingCount,
      smsSent: items.filter((i) => i.smsSentAt).length,
      withMobile: withMobile.length,
    },
  });
});
