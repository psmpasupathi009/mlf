import { apiHandler, jsonFail, jsonOk, jsonOkList, parsePagination } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { applyLeaveSchema } from "@/lib/validations/hrms.schema";
import { toLeaveSummary } from "@/features/hrms/server/serialize";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "hrms", "own_leave");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const userUnitId = searchParams.get("userUnitId")?.trim();
  const status = searchParams.get("status")?.trim();

  const canApprove = await hasPermission(user.id, "hrms", "approve_leave");

  const where = {
    ...(canApprove ? (userUnitId ? { userUnitId } : {}) : { userId: user.id }),
    ...(status ? { status: status as never } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.leaveRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
    prisma.leaveRequest.count({ where }),
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
    rows.map((r) => toLeaveSummary(r, nameByUnit.get(r.userUnitId))),
    { page, pageSize, total }
  );
});

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "hrms", "own_leave");
  if (!user) return response;

  const raw = await request.json();
  const parsed = applyLeaveSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  const unitId = await nextUnitId("leave");
  const created = await prisma.leaveRequest.create({
    data: {
      unitId,
      userId: user.id,
      userUnitId: user.unitId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      reason: input.reason || undefined,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "leave.apply",
    entity: "LeaveRequest",
    entityUnitId: created.unitId,
  });

  return jsonOk({ leave: toLeaveSummary(created) }, 201);
});
