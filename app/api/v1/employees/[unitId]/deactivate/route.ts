import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { revokeAllRefreshTokens } from "@/lib/auth/session";
import { wouldRemoveLastAdmin } from "@/lib/rbac/employee-guards";
import { toEmployeeSummary } from "@/features/employees/server/serialize";

export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "employees", "deactivate");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const target = unitId ? await prisma.user.findUnique({ where: { unitId } }) : null;
  if (!target) return jsonFail("NOT_FOUND", "Employee not found", 404);

  if (target.id === user.id) {
    return jsonFail("FORBIDDEN", "You can’t deactivate your own account", 403);
  }

  if (await wouldRemoveLastAdmin(target, false, target.roles)) {
    return jsonFail("CONFLICT", "This is the last active admin — assign another admin first", 409);
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: false },
  });

  await revokeAllRefreshTokens(target.id);

  await writeAudit({
    actorUnitId: user.unitId,
    action: "employee.deactivate",
    entity: "User",
    entityUnitId: updated.unitId,
  });

  return jsonOk({ employee: toEmployeeSummary(updated) });
});
