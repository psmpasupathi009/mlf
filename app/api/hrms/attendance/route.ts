import { apiHandler, jsonOkList, parsePagination } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/rbac";
import { toAttendanceSummary } from "@/features/hrms/server/serialize";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "hrms", "own_attendance");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const userUnitId = searchParams.get("userUnitId")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const all = searchParams.get("all") === "1" || searchParams.get("all") === "true";
  const mine = searchParams.get("mine") === "1" || searchParams.get("mine") === "true";

  const canManage = await hasPermission(user.id, "hrms", "manage_attendance");

  // Default to self. Managers may query one person (userUnitId) or everyone (all=1).
  const scope =
    canManage && all && !mine
      ? {}
      : canManage && userUnitId && !mine
        ? { userUnitId }
        : { userId: user.id };

  const where = {
    ...scope,
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.attendance.findMany({ where, orderBy: { date: "desc" }, skip, take: pageSize }),
    prisma.attendance.count({ where }),
  ]);

  const unitIds = Array.from(new Set(rows.map((r) => r.userUnitId)));
  const users =
    unitIds.length > 0
      ? await prisma.user.findMany({
          where: { unitId: { in: unitIds } },
          select: { unitId: true, name: true },
        })
      : [];
  const nameByUnit = new Map(users.map((u) => [u.unitId, u.name]));

  return jsonOkList(
    rows.map((r) => toAttendanceSummary(r, nameByUnit.get(r.userUnitId))),
    { page, pageSize, total }
  );
});
