import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { isModuleEnabled } from "@/config/company/modules";
import { prisma } from "@/lib/db/prisma";
import { istDayBounds, istDateKey } from "@/lib/utils/ist";
import { displayMobile } from "@/lib/auth/mobile";
import { toAppointmentSummary } from "@/features/appointments/server/serialize";
import { toOfficeTaskSummary } from "@/features/tasks/server/serialize";

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
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const canCases =
    isModuleEnabled("cases") &&
    (await hasPermission(user.id, "cases", "view"));
  const canAppointments =
    isModuleEnabled("appointments") &&
    (await hasPermission(user.id, "appointments", "view"));
  const canTasks =
    isModuleEnabled("tasks") &&
    (await hasPermission(user.id, "tasks", "view"));

  if (!canCases && !canAppointments && !canTasks) {
    return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const advocateParam = url.searchParams.get("advocateMobile");
  const dateKey = dateParam || istDateKey(new Date());
  const { start, end } = istDayBounds(dateKey);

  const isOfficeAdmin =
    user.roles.includes("admin") || user.roles.includes("sub_admin");

  let caseUnitIdFilter: string[] | null = null;
  let advocateKeys: string[] | null = null;
  if (advocateParam) {
    advocateKeys = mobileMatchKeys(advocateParam);
    if (advocateKeys.length) {
      const advocateCases = await prisma.case.findMany({
        where: { primaryAdvocateMobile: { in: advocateKeys } },
        select: { unitId: true },
      });
      caseUnitIdFilter = advocateCases.map((c) => c.unitId);
    } else {
      caseUnitIdFilter = [];
    }
  }

  const emptyHearings =
    !canCases || (caseUnitIdFilter !== null && caseUnitIdFilter.length === 0);

  const hearingsPromise = emptyHearings
    ? Promise.resolve([])
    : prisma.hearing.findMany({
        where: {
          hearingDate: { gte: start, lte: end },
          isAdjourned: false,
          ...(caseUnitIdFilter ? { caseUnitId: { in: caseUnitIdFilter } } : {}),
        },
        orderBy: { hearingDate: "asc" },
        take: DIARY_LIMIT + 1,
      });

  const appointmentsPromise =
    !canAppointments
      ? Promise.resolve([])
      : advocateParam && (!advocateKeys || advocateKeys.length === 0)
        ? Promise.resolve([])
        : prisma.appointment.findMany({
            where: {
              scheduledAt: { gte: start, lte: end },
              status: "scheduled",
              ...(advocateKeys && advocateKeys.length
                ? { advocateMobile: { in: advocateKeys } }
                : {}),
            },
            orderBy: { scheduledAt: "asc" },
            take: DIARY_LIMIT,
          });

  const tasksPromise = canTasks
    ? prisma.officeTask.findMany({
        where: {
          status: "open",
          ...(isOfficeAdmin ? {} : { assigneeUnitId: user.unitId }),
          OR: [
            { workDate: { gte: start, lte: end } },
            { dueDate: { gte: start, lte: end } },
          ],
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        take: DIARY_LIMIT,
      })
    : Promise.resolve([]);

  const [hearings, appointmentsRaw, tasksRaw] = await Promise.all([
    hearingsPromise,
    appointmentsPromise,
    tasksPromise,
  ]);

  const truncated = hearings.length > DIARY_LIMIT;
  const pageHearings = truncated ? hearings.slice(0, DIARY_LIMIT) : hearings;

  const caseUnitIds = [
    ...new Set([
      ...pageHearings.map((h) => h.caseUnitId),
      ...appointmentsRaw
        .map((a) => a.caseUnitId)
        .filter(Boolean) as string[],
      ...tasksRaw.map((t) => t.caseUnitId).filter(Boolean) as string[],
    ]),
  ];
  const cases = caseUnitIds.length
    ? await prisma.case.findMany({
        where: { unitId: { in: caseUnitIds } },
      })
    : [];
  const caseMap = new Map(cases.map((c) => [c.unitId, c]));

  const clientUnitIds = [
    ...new Set([
      ...cases.map((c) => c.clientUnitId),
      ...appointmentsRaw
        .map((a) => a.clientUnitId)
        .filter(Boolean) as string[],
    ]),
  ];
  const clients = clientUnitIds.length
    ? await prisma.client.findMany({
        where: { unitId: { in: clientUnitIds } },
      })
    : [];
  const clientMap = new Map(clients.map((c) => [c.unitId, c]));

  const advocateMobiles = [
    ...new Set(
      [
        ...cases.map((c) => c.primaryAdvocateMobile),
        ...appointmentsRaw.map((a) => a.advocateMobile),
      ].filter(Boolean) as string[]
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

  const appointments = appointmentsRaw.map((a) => {
    const mob = a.advocateMobile;
    return toAppointmentSummary(a, {
      clientName: a.clientUnitId
        ? clientMap.get(a.clientUnitId)?.name ?? null
        : null,
      advocateName: mob
        ? advName.get(mob) ?? advName.get(toTen(mob)) ?? null
        : null,
    });
  });

  const assigneeUnitIds = [
    ...new Set(tasksRaw.map((t) => t.assigneeUnitId).filter(Boolean) as string[]),
  ];
  const assignees = assigneeUnitIds.length
    ? await prisma.user.findMany({
        where: { unitId: { in: assigneeUnitIds } },
        select: { unitId: true, name: true },
      })
    : [];
  const assigneeMap = new Map(assignees.map((a) => [a.unitId, a.name]));

  const tasks = tasksRaw.map((t) =>
    toOfficeTaskSummary(t, {
      assigneeName: t.assigneeUnitId
        ? assigneeMap.get(t.assigneeUnitId) ?? null
        : null,
      caseNumber: t.caseUnitId
        ? caseMap.get(t.caseUnitId)?.caseNumber ?? null
        : null,
    })
  );

  return jsonOk({
    date: dateKey,
    items,
    appointments,
    tasks,
    meta: { truncated, limit: DIARY_LIMIT },
  });
});
