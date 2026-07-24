import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";

/** Owner can withdraw a pending leave request (e.g. applied by mistake). */
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

  await prisma.leaveRequest.delete({ where: { id: leave.id } });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "leave.cancel",
    entity: "LeaveRequest",
    entityUnitId: leave.unitId,
  });

  return jsonOk({ cancelled: true, unitId: leave.unitId });
});
