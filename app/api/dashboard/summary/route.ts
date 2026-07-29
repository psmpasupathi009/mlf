import { apiHandler, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { buildDashboardSummary } from "@/features/home/server/dashboard-summary";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "dashboard", "view");
  if (!user) return response;

  const summary = await buildDashboardSummary(user);
  return jsonOk({ summary });
});
