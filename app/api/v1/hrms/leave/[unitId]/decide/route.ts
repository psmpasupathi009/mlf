import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { decideLeaveSchema } from "@/lib/validations/hrms.schema";
import { toLeaveSummary } from "@/features/hrms/server/serialize";

export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "hrms", "approve_leave");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const leave = unitId ? await prisma.leaveRequest.findUnique({ where: { unitId } }) : null;
  if (!leave) return jsonFail("NOT_FOUND", "Leave request not found", 404);

  if (leave.status !== "pending") {
    return jsonFail("CONFLICT", "This leave request has already been decided", 409);
  }
  if (leave.userId === user.id) {
    return jsonFail("FORBIDDEN", "You cannot approve or reject your own leave", 403);
  }

  const raw = await request.json();
  const parsed = decideLeaveSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  if (input.decision === "rejected" && !input.rejectReason) {
    return jsonFail("VALIDATION", "A reason is required to reject leave", 400);
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: {
      status: input.decision,
      approvedById: user.id,
      approvedAt: new Date(),
      rejectReason: input.decision === "rejected" ? input.rejectReason : undefined,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: `leave.${input.decision}`,
    entity: "LeaveRequest",
    entityUnitId: updated.unitId,
  });

  return jsonOk({ leave: toLeaveSummary(updated) });
});
