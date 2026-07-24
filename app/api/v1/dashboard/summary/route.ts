import { apiHandler, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { buildDashboardSummary } from "@/features/home/server/dashboard-summary";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const summary = await buildDashboardSummary(user);
  return jsonOk({ summary });
});
