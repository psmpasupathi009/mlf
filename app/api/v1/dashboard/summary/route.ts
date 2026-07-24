import { apiHandler, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { istDateKey, istDayBounds, formatIstTime } from "@/lib/utils/ist";
import { displayMobile } from "@/lib/auth/mobile";
import { personDisplayName } from "@/shared/lib/person";
import { userPhotoUrl } from "@/lib/auth/user-photo";

function toTen(mobile: string): string {
  const d = mobile.replace(/\D/g, "");
  return d.length === 12 && d.startsWith("91") ? d.slice(2) : d.slice(-10);
}

export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const can = (module: string, action: string) =>
    hasPermission(user.id, module, action);

  const isOfficeAdmin =
    user.roles.includes("admin") || user.roles.includes("sub_admin");

  const todayKey = istDateKey();
  const { start: todayStart, end: todayEnd } = istDayBounds(todayKey);
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // IST calendar month start (not server-local midnight)
  const [yStr, mStr] = todayKey.split("-");
  const monthKey = `${yStr}-${mStr}-01`;
  const { start: startOfMonth } = istDayBounds(monthKey);

  const summary: Record<string, unknown> = {
    todayKey,
    isOfficeAdmin,
  };

  if (await can("cases", "view")) {
    const [total, pending, listed, weekHearings, missingCourtNumber, todayCases] =
      await Promise.all([
        prisma.case.count(),
        prisma.case.count({ where: { status: "pending" } }),
        prisma.case.count({ where: { status: "listed" } }),
        prisma.case.count({
          where: {
            nextHearingAt: { gte: todayStart, lt: weekEnd },
            status: { in: ["pending", "listed"] },
          },
        }),
        prisma.case.count({
          where: {
            OR: [{ caseNumber: null }, { caseNumber: "" }],
            status: { in: ["pending", "listed"] },
          },
        }),
        prisma.case.findMany({
          where: {
            nextHearingAt: { gte: todayStart, lte: todayEnd },
            status: { in: ["pending", "listed"] },
          },
          orderBy: { nextHearingAt: "asc" },
          take: 20,
          select: {
            unitId: true,
            caseNumber: true,
            courtName: true,
            district: true,
            status: true,
            nextHearingAt: true,
            clientUnitId: true,
            clientId: true,
            primaryAdvocateMobile: true,
            caseType: true,
          },
        }),
      ]);

    const clientIds = [...new Set(todayCases.map((c) => c.clientId))];
    const advocateMobiles = [
      ...new Set(
        todayCases
          .map((c) => c.primaryAdvocateMobile)
          .filter(Boolean) as string[]
      ),
    ];

    const [clients, advocates] = await Promise.all([
      clientIds.length
        ? prisma.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, unitId: true, name: true, mobile: true },
          })
        : Promise.resolve([]),
      advocateMobiles.length
        ? prisma.user.findMany({
            where: {
              OR: advocateMobiles.flatMap((m) => {
                const ten = toTen(m);
                return [{ mobile: m }, { mobile: ten }, { mobile: `91${ten}` }];
              }),
            },
            select: { mobile: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const clientById = new Map(clients.map((c) => [c.id, c]));
    const advName = new Map<string, string>();
    for (const a of advocates) {
      const ten = toTen(a.mobile);
      if (a.name) {
        advName.set(a.mobile, a.name);
        advName.set(ten, a.name);
        advName.set(`91${ten}`, a.name);
      }
    }

    const todayHearings = todayCases.map((c) => {
      const client = clientById.get(c.clientId);
      const mob = c.primaryAdvocateMobile;
      return {
        caseUnitId: c.unitId,
        caseNumber: c.caseNumber,
        caseType: c.caseType,
        courtName: c.courtName,
        district: c.district,
        status: c.status,
        nextHearingAt: c.nextHearingAt?.toISOString() ?? null,
        clientName: client?.name ?? "—",
        clientUnitId: client?.unitId ?? c.clientUnitId,
        clientMobile: client?.mobile ? displayMobile(client.mobile) : null,
        advocateMobile: mob ? displayMobile(mob) : null,
        advocateName: mob
          ? advName.get(mob) ?? advName.get(toTen(mob)) ?? null
          : null,
      };
    });

    summary.cases = {
      total,
      pending,
      listed,
      open: pending + listed,
      weekHearings,
      missingCourtNumber,
      todayHearings,
    };
  }

  if (await can("clients", "view")) {
    summary.clients = { total: await prisma.client.count() };
  }

  if (await can("employees", "view")) {
    const [total, active, advocates] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({
        where: { isActive: true, roles: { has: "advocate" } },
      }),
    ]);
    summary.employees = { total, active, advocates };
  }

  if (await can("accounts", "view")) {
    const [pendingAgg, paidThisMonthAgg, pendingCount] = await Promise.all([
      prisma.cashPayment.aggregate({
        where: { status: "pending" },
        _sum: { amount: true },
      }),
      prisma.cashPayment.aggregate({
        where: { status: "paid", paidOn: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.cashPayment.count({ where: { status: "pending" } }),
    ]);
    summary.accounts = {
      pendingAmount: pendingAgg._sum.amount ?? 0,
      pendingCount,
      paidThisMonth: paidThisMonthAgg._sum.amount ?? 0,
    };
  }

  if (await can("appointments", "view")) {
    const [todayCount, weekCount, todayRows, weekRows] = await Promise.all([
      prisma.appointment.count({
        where: {
          status: "scheduled",
          scheduledAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.appointment.count({
        where: {
          status: "scheduled",
          scheduledAt: { gte: todayStart, lt: weekEnd },
        },
      }),
      prisma.appointment.findMany({
        where: {
          status: "scheduled",
          scheduledAt: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { scheduledAt: "asc" },
        take: 40,
      }),
      prisma.appointment.findMany({
        where: {
          status: "scheduled",
          scheduledAt: { gte: todayStart, lt: weekEnd },
        },
        orderBy: { scheduledAt: "asc" },
        take: 80,
      }),
    ]);

    const allForNames = [...todayRows, ...weekRows];
    const clientUnitIds = [
      ...new Set(
        allForNames.map((a) => a.clientUnitId).filter(Boolean) as string[]
      ),
    ];
    const apptAdvMobiles = [
      ...new Set(
        allForNames.map((a) => a.advocateMobile).filter(Boolean) as string[]
      ),
    ];

    const [apptClients, apptAdvocates] = await Promise.all([
      clientUnitIds.length
        ? prisma.client.findMany({
            where: { unitId: { in: clientUnitIds } },
            select: { unitId: true, name: true, mobile: true },
          })
        : Promise.resolve([]),
      apptAdvMobiles.length
        ? prisma.user.findMany({
            where: {
              OR: apptAdvMobiles.flatMap((m) => {
                const ten = toTen(m);
                return [{ mobile: m }, { mobile: ten }, { mobile: `91${ten}` }];
              }),
            },
            select: { mobile: true, name: true, unitId: true, photoKey: true },
          })
        : Promise.resolve([]),
    ]);

    const clientByUnit = new Map(apptClients.map((c) => [c.unitId, c]));
    const advByMobile = new Map<
      string,
      { name: string; unitId: string; photoUrl?: string }
    >();
    for (const a of apptAdvocates) {
      const ten = toTen(a.mobile);
      const info = {
        name: personDisplayName({
          name: a.name,
          mobile: a.mobile,
          unitId: a.unitId,
        }),
        unitId: a.unitId,
        photoUrl: userPhotoUrl(a.unitId, Boolean(a.photoKey)),
      };
      advByMobile.set(a.mobile, info);
      advByMobile.set(ten, info);
      advByMobile.set(`91${ten}`, info);
    }

    function mapAppt(
      a: (typeof todayRows)[number]
    ): Record<string, unknown> {
      const client = a.clientUnitId
        ? clientByUnit.get(a.clientUnitId)
        : undefined;
      const adv = a.advocateMobile
        ? advByMobile.get(a.advocateMobile) ??
          advByMobile.get(toTen(a.advocateMobile))
        : undefined;
      return {
        unitId: a.unitId,
        title: a.title,
        scheduledAt: a.scheduledAt.toISOString(),
        timeLabel: formatIstTime(a.scheduledAt),
        durationMin: a.durationMin,
        mode: a.mode ?? "office",
        location: a.location,
        notes: a.notes,
        status: a.status,
        clientUnitId: a.clientUnitId,
        clientName: client?.name ?? null,
        clientMobile: client?.mobile ? displayMobile(client.mobile) : null,
        advocateMobile: a.advocateMobile
          ? displayMobile(a.advocateMobile)
          : null,
        advocateName: adv?.name ?? null,
        advocateUnitId: adv?.unitId ?? null,
        advocatePhotoUrl: adv?.photoUrl ?? null,
      };
    }

    const byAdvocateMap = new Map<
      string,
      { mobile: string; name: string; today: number; week: number }
    >();

    for (const a of todayRows) {
      const key = a.advocateMobile ? toTen(a.advocateMobile) : "unassigned";
      const name =
        key === "unassigned"
          ? "Unassigned"
          : advByMobile.get(a.advocateMobile!)?.name ??
            advByMobile.get(key)?.name ??
            displayMobile(a.advocateMobile!) ??
            key;
      const cur = byAdvocateMap.get(key) ?? {
        mobile: key === "unassigned" ? "" : key,
        name,
        today: 0,
        week: 0,
      };
      cur.today += 1;
      byAdvocateMap.set(key, cur);
    }
    for (const a of weekRows) {
      const key = a.advocateMobile ? toTen(a.advocateMobile) : "unassigned";
      const name =
        key === "unassigned"
          ? "Unassigned"
          : advByMobile.get(a.advocateMobile!)?.name ??
            advByMobile.get(key)?.name ??
            displayMobile(a.advocateMobile!) ??
            key;
      const cur = byAdvocateMap.get(key) ?? {
        mobile: key === "unassigned" ? "" : key,
        name,
        today: 0,
        week: 0,
      };
      cur.week += 1;
      byAdvocateMap.set(key, cur);
    }

    summary.appointments = {
      today: todayCount,
      week: weekCount,
      todayList: todayRows.map(mapAppt),
      weekList: weekRows.slice(0, 25).map(mapAppt),
      byAdvocate: Array.from(byAdvocateMap.values()).sort(
        (a, b) => b.today - a.today || b.week - a.week
      ),
    };
  }

  if (await can("hrms", "view")) {
    const [myAttendance, pendingLeave, onLeaveToday] = await Promise.all([
      prisma.attendance.findUnique({
        where: { userId_date: { userId: user.id, date: todayKey } },
      }),
      (await can("hrms", "approve_leave"))
        ? prisma.leaveRequest.count({ where: { status: "pending" } })
        : Promise.resolve(null),
      prisma.leaveRequest.findFirst({
        where: {
          userId: user.id,
          status: "approved",
          fromDate: { lte: todayKey },
          toDate: { gte: todayKey },
        },
        select: { unitId: true },
      }),
    ]);
    summary.hrms = {
      checkedInToday: Boolean(myAttendance?.checkInAt),
      checkedOutToday: Boolean(myAttendance?.checkOutAt),
      onApprovedLeaveToday: Boolean(onLeaveToday),
      pendingLeaveApprovals: pendingLeave,
    };
  }

  // Admin / sub-admin office board — same gate as HRMS presence API
  if (isOfficeAdmin && (await can("hrms", "manage_attendance"))) {
    const { buildPresenceBoard } = await import("@/features/hrms/server/presence");
    const board = await buildPresenceBoard(todayKey);
    summary.adminBoard = {
      staff: board.people.map((p) => ({
        unitId: p.unitId,
        name: p.displayName,
        mobile: p.mobile,
        photoUrl: p.photoUrl,
        checkedIn: p.status === "in" || p.status === "out",
        checkedOut: p.status === "out",
        status: p.status,
        notes: p.notes,
        busyToday: p.busyToday,
      })),
      counts: board.counts,
      // Legacy keys used by older home widgets
      advocates: board.people.map((p) => ({
        unitId: p.unitId,
        name: p.displayName,
        mobile: p.mobile,
        photoUrl: p.photoUrl,
        checkedIn: p.status === "in" || p.status === "out",
        checkedOut: p.status === "out",
        status: p.status,
        notes: p.notes,
        busyToday: p.busyToday,
      })),
      checkedInCount: board.counts.present + board.counts.out,
      advocateCount: board.counts.total,
    };
  }

  return jsonOk({ summary });
});
