import { apiHandler, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { istDayBounds, istDateKey } from "@/lib/utils/ist";
import { displayMobile } from "@/lib/auth/mobile";

const DIARY_LIMIT = 100;

function toTen(mobile: string): string {
  const d = mobile.replace(/\D/g, "");
  return d.length === 12 && d.startsWith("91") ? d.slice(2) : d.slice(-10);
}

function mobileMatchKeys(mobile: string): string[] {
  const ten = toTen(mobile);
  if (!ten || ten.length < 10) return [];
  return [...new Set([mobile, ten, `91${ten}`, displayMobile(mobile)])];
}

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "view");
  if (!user) return response;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const advocateParam = url.searchParams.get("advocateMobile");
  const dateKey = dateParam || istDateKey(new Date());
  const { start, end } = istDayBounds(dateKey);

  let caseUnitIdFilter: string[] | null = null;
  if (advocateParam) {
    const keys = mobileMatchKeys(advocateParam);
    if (keys.length) {
      const advocateCases = await prisma.case.findMany({
        where: { primaryAdvocateMobile: { in: keys } },
        select: { unitId: true },
      });
      caseUnitIdFilter = advocateCases.map((c) => c.unitId);
      if (caseUnitIdFilter.length === 0) {
        return jsonOk({
          date: dateKey,
          items: [],
          meta: { truncated: false, limit: DIARY_LIMIT },
        });
      }
    }
  }

  const hearings = await prisma.hearing.findMany({
    where: {
      hearingDate: { gte: start, lte: end },
      isAdjourned: false,
      ...(caseUnitIdFilter ? { caseUnitId: { in: caseUnitIdFilter } } : {}),
    },
    orderBy: { hearingDate: "asc" },
    take: DIARY_LIMIT + 1,
  });

  const truncated = hearings.length > DIARY_LIMIT;
  const pageHearings = truncated ? hearings.slice(0, DIARY_LIMIT) : hearings;

  const caseUnitIds = [...new Set(pageHearings.map((h) => h.caseUnitId))];
  const cases = caseUnitIds.length
    ? await prisma.case.findMany({
        where: { unitId: { in: caseUnitIds } },
      })
    : [];
  const caseMap = new Map(cases.map((c) => [c.unitId, c]));

  const clientUnitIds = [...new Set(cases.map((c) => c.clientUnitId))];
  const clients = clientUnitIds.length
    ? await prisma.client.findMany({
        where: { unitId: { in: clientUnitIds } },
      })
    : [];
  const clientMap = new Map(clients.map((c) => [c.unitId, c]));

  const advocateMobiles = [
    ...new Set(
      cases
        .map((c) => c.primaryAdvocateMobile)
        .filter(Boolean) as string[]
    ),
  ];
  const advocates = advocateMobiles.length
    ? await prisma.user.findMany({
        where: {
          OR: advocateMobiles.flatMap((m) => {
            const ten = toTen(m);
            return [{ mobile: m }, { mobile: ten }, { mobile: `91${ten}` }];
          }),
        },
        select: { mobile: true, name: true },
      })
    : [];

  const advName = new Map<string, string>();
  for (const a of advocates) {
    const ten = toTen(a.mobile);
    if (a.name) {
      advName.set(a.mobile, a.name);
      advName.set(ten, a.name);
      advName.set(`91${ten}`, a.name);
    }
  }

  const items = pageHearings
    .map((h) => {
      const cse = caseMap.get(h.caseUnitId);
      const client = cse ? clientMap.get(cse.clientUnitId) : null;
      const mob = cse?.primaryAdvocateMobile ?? null;
      return {
        hearingUnitId: h.unitId,
        hearingDate: h.hearingDate.toISOString(),
        purpose: h.purpose,
        notes: h.notes,
        smsSentAt: h.smsSentAt?.toISOString() ?? null,
        caseUnitId: h.caseUnitId,
        caseNumber: cse?.caseNumber ?? null,
        caseStatus: cse?.status ?? null,
        stage: cse?.stage ?? null,
        clientName: client?.name ?? null,
        clientUnitId: client?.unitId ?? null,
        courtName: cse?.courtName ?? null,
        primaryAdvocateMobile: mob ? displayMobile(mob) : null,
        advocateName: mob
          ? advName.get(mob) ?? advName.get(toTen(mob)) ?? null
          : null,
      };
    })
    .sort((a, b) => {
      const courtA = (a.courtName || "Court TBD").toLocaleLowerCase("en");
      const courtB = (b.courtName || "Court TBD").toLocaleLowerCase("en");
      if (courtA !== courtB) return courtA.localeCompare(courtB);
      const caseA = (a.caseNumber || a.caseUnitId).toLocaleLowerCase("en");
      const caseB = (b.caseNumber || b.caseUnitId).toLocaleLowerCase("en");
      if (caseA !== caseB) return caseA.localeCompare(caseB);
      return a.hearingDate.localeCompare(b.hearingDate);
    });

  return jsonOk({
    date: dateKey,
    items,
    meta: { truncated, limit: DIARY_LIMIT },
  });
});
