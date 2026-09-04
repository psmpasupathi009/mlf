import { prisma } from "@/lib/db/prisma";
import { istDateKey, istDayBounds } from "@/lib/utils/ist";
import { toOfficeTaskSummary } from "@/features/tasks/server/serialize";
import type { OfficeTaskSummary } from "@/features/tasks/server/serialize";

/** Open tasks due/worked today or overdue — must be answered before logout / check-out. */
function pendingWhere(assigneeUnitId: string, dateKey: string) {
  const { start, end } = istDayBounds(dateKey);
  return {
    status: "open" as const,
    assigneeUnitId,
    OR: [
      { workDate: { lte: end } },
      { dueDate: { lte: end } },
      {
        AND: [
          { workDate: null },
          { dueDate: null },
          { createdAt: { gte: start, lte: end } },
        ],
      },
    ],
  };
}

/**
 * Open tasks for this assignee due/worked today or still overdue (IST).
 * Must be answered with a finish note before logout / check-out.
 */
export async function findPendingEveningTasks(
  assigneeUnitId: string,
  dateKey: string = istDateKey()
): Promise<OfficeTaskSummary[]> {
  const rows = await prisma.officeTask.findMany({
    where: pendingWhere(assigneeUnitId, dateKey),
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });

  return rows.map((r) => toOfficeTaskSummary(r));
}

export async function countPendingEveningTasks(
  assigneeUnitId: string,
  dateKey: string = istDateKey()
): Promise<number> {
  return prisma.officeTask.count({
    where: pendingWhere(assigneeUnitId, dateKey),
  });
}
