import { apiHandler, jsonFail, jsonOkList, parsePagination } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";

/**
 * Advocates list for case assignment and appointment booking.
 */
export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const canCases = await hasPermission(user.id, "cases", "view");
  const canAppt =
    (await hasPermission(user.id, "appointments", "view")) ||
    (await hasPermission(user.id, "appointments", "create"));
  if (!canCases && !canAppt) {
    return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
  }

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const q = searchParams.get("q")?.trim() ?? "";
  const digits = q.replace(/\D/g, "");

  const where = {
    isActive: true,
    roles: { has: "advocate" as const },
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            ...(digits ? [{ mobile: { contains: digits } }] : []),
            { unitId: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: pageSize,
      select: {
        unitId: true,
        name: true,
        mobile: true,
        designation: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return jsonOkList(
    rows.map((r) => ({
      unitId: r.unitId,
      name: r.name ?? "Advocate",
      mobile: r.mobile,
      designation: r.designation,
    })),
    { page, pageSize, total }
  );
});
