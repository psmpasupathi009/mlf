import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { getEffectivePermissionsForRoles } from "@/lib/rbac";
import { permissionsPreviewSchema } from "@/lib/validations/employees.schema";

/** Preview the union of effective permissions for a set of roles (employee create/edit dialogs). */
export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "employees", "view");
  if (!user) return response;

  const raw = await request.json();
  const parsed = permissionsPreviewSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }

  const permissions = await getEffectivePermissionsForRoles(parsed.data.roles);

  return jsonOk({ roles: parsed.data.roles, permissions });
});
