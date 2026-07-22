import { apiHandler, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { istDayBounds, istDateKey } from "@/lib/utils/ist";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "view");
  if (!user) return response;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const dateKey = dateParam || istDateKey(new Date());
  const { start, end } = istDayBounds(dateKey);

  const hearings = await prisma.hearing.findMany({
    where: {
      hearingDate: { gte: start, lte: end },
      isAdjourned: false,
    },
    orderBy: { hearingDate: "asc" },
    take: 100,
  });

  const caseUnitIds = [...new Set(hearings.map((h) => h.caseUnitId))];
  const cases = await prisma.case.findMany({
    where: { unitId: { in: caseUnitIds } },
  });
  const caseMap = new Map(cases.map((c) => [c.unitId, c]));

  const clientUnitIds = [...new Set(cases.map((c) => c.clientUnitId))];
  const clients = await prisma.client.findMany({
    where: { unitId: { in: clientUnitIds } },
  });
  const clientMap = new Map(clients.map((c) => [c.unitId, c]));

  const items = hearings.map((h) => {
    const cse = caseMap.get(h.caseUnitId);
    const client = cse ? clientMap.get(cse.clientUnitId) : null;
    return {
      hearingUnitId: h.unitId,
      hearingDate: h.hearingDate,
      purpose: h.purpose,
      smsSentAt: h.smsSentAt,
      caseUnitId: h.caseUnitId,
      caseNumber: cse?.caseNumber ?? null,
      caseStatus: cse?.status ?? null,
      clientName: client?.name ?? null,
      clientUnitId: client?.unitId ?? null,
      courtName: cse?.courtName ?? null,
    };
  });

  return jsonOk({ date: dateKey, items });
});
