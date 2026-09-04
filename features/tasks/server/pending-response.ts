import { prisma } from "@/lib/db/prisma";
import { istDateKey, istDayBounds } from "@/lib/utils/ist";
import { toOfficeTaskSummary } from "@/features/tasks/server/serialize";
import type { OfficeTaskSummary } from "@/features/tasks/server/serialize";

/**
 * Open tasks for this assignee due/worked today (IST) — must be answered
 * with a finish note before logout / check-out.
 */
export async function findPendingEveningTasks(
  assigneeUnitId: string,
  dateKey: string = istDateKey()
): Promise<OfficeTaskSummary[]> {
  const { start, end } = istDayBounds(dateKey);
  const rows = await prisma.officeTask.findMany({
    where: {
      status: "open",
      assigneeUnitId,
      OR: [
        { workDate: { gte: start, lte: end } },
        { dueDate: { gte: start, lte: end } },
      ],
    },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });

  return rows.map((r) => toOfficeTaskSummary(r));
}

export async function countPendingEveningTasks(
  assigneeUnitId: string,
  dateKey: string = istDateKey()
): Promise<number> {
  const { start, end } = istDayBounds(dateKey);
  return prisma.officeTask.count({
    where: {
      status: "open",
      assigneeUnitId,
      OR: [
        { workDate: { gte: start, lte: end } },
        { dueDate: { gte: start, lte: end } },
      ],
    },
  });
}
