import { apiHandler, jsonOk, jsonFail } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { containsInsensitive } from "@/lib/db/search";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return jsonOk({ employees: [], clients: [], cases: [] });
  }

  const [canEmployees, canClients, canCases] = await Promise.all([
    hasPermission(user.id, "employees", "view"),
    hasPermission(user.id, "clients", "view"),
    hasPermission(user.id, "cases", "view"),
  ]);

  if (!canEmployees && !canClients && !canCases) {
    return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
  }

  const digits = q.replace(/\D/g, "");

  const [employees, clients, cases] = await Promise.all([
    canEmployees
      ? prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { unitId: containsInsensitive(q) },
              { name: containsInsensitive(q) },
              ...(digits.length >= 4 ? [{ mobile: { contains: digits } }] : []),
            ],
          },
          take: 8,
          select: {
            unitId: true,
            name: true,
            mobile: true,
            designation: true,
          },
        })
      : Promise.resolve([]),
    canClients
      ? prisma.client.findMany({
          where: {
            OR: [
              { unitId: containsInsensitive(q) },
              { name: containsInsensitive(q) },
              ...(digits.length >= 4 ? [{ mobile: { contains: digits } }] : []),
            ],
          },
          take: 8,
          select: { unitId: true, name: true, mobile: true },
        })
      : Promise.resolve([]),
    canCases
      ? prisma.case.findMany({
          where: {
            OR: [
              { unitId: containsInsensitive(q) },
              { caseNumber: containsInsensitive(q) },
              { opposingParty: containsInsensitive(q) },
            ],
          },
          take: 8,
          select: {
            unitId: true,
            caseNumber: true,
            status: true,
            opposingParty: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return jsonOk({ employees, clients, cases });
});
