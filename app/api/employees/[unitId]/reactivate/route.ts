import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit, pickAuditFields, diffAudit } from "@/lib/audit";
import { toEmployeeSummary } from "@/features/employees/server/serialize";

export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "employees", "deactivate");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const target = unitId ? await prisma.user.findUnique({ where: { unitId } }) : null;
  if (!target) return jsonFail("NOT_FOUND", "Employee not found", 404);

  const before = pickAuditFields(target as Record<string, unknown>, ["isActive"] as const);

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: true },
  });

  const after = pickAuditFields(updated as Record<string, unknown>, ["isActive"] as const);
  await writeAudit({
    actorUnitId: user.unitId,
    action: "employee.reactivate",
    entity: "User",
    entityUnitId: updated.unitId,
    meta: { before, after, changes: diffAudit(before, after) },
  });

  return jsonOk({ employee: toEmployeeSummary(updated) });
});
