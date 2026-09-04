import { apiHandler, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { isClientOnlyUser } from "@/lib/auth/client-portal";
import { findPendingEveningTasks } from "@/features/tasks/server/pending-response";

/** Open tasks for the current user that need an evening response today. */
export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  if (isClientOnlyUser(user.roles)) {
    return jsonOk({ tasks: [] as const, count: 0 });
  }

  const tasks = await findPendingEveningTasks(user.unitId);
  return jsonOk({ tasks, count: tasks.length });
});
