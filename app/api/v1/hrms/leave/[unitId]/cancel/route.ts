import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { toLeaveSummary } from "@/features/hrms/server/serialize";

/** Owner can withdraw a pending leave request (soft-cancel for audit). */
export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "hrms", "own_leave");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const leave = unitId
    ? await prisma.leaveRequest.findUnique({ where: { unitId } })
    : null;
  if (!leave) return jsonFail("NOT_FOUND", "Leave request not found", 404);

  if (leave.userId !== user.id) {
    return jsonFail("FORBIDDEN", "You can only cancel your own leave request", 403);
  }
  if (leave.status !== "pending") {
    return jsonFail(
      "CONFLICT",
      "Only pending leave requests can be cancelled",
      409
    );
  }

  // Soft-cancel — LeaveStatus.cancelled in schema.prisma.
  // Assert via unknown so a stale TS server (pre-generate) does not block.
  const data = {
    status: "cancelled",
  } as unknown as Prisma.LeaveRequestUpdateInput;

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data,
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "leave.cancel",
    entity: "LeaveRequest",
    entityUnitId: leave.unitId,
  });

  return jsonOk({
    cancelled: true,
    unitId: leave.unitId,
    leave: toLeaveSummary(updated),
  });
});
