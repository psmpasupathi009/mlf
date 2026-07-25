import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { compliance } from "@/config/company/compliance";
import { importTasksSchema, officeTaskKindEnum } from "@/lib/validations/tasks.schema";
import { istDayBounds } from "@/lib/utils/ist";
import { notifyUser, scheduleNotify } from "@/lib/notifications/notify";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";

type RowResult = {
  row: number;
  unitId: string | null;
  status: "ok" | "error";
  message: string;
};

function parseDay(value: string | undefined | null) {
  if (!value?.trim()) return null;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return istDayBounds(s).start;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "tasks", "create");
  if (!user) return response;

  const limited = await assertImportRateLimit(request, user.unitId);
  if (limited) return limited;

  const raw = await request.json();
  const parsed = importTasksSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const { dryRun, rows } = parsed.data;

  if (rows.length > compliance.csv.maxRows) {
    return jsonFail(
      "VALIDATION",
      `Max ${compliance.csv.maxRows} rows per import`,
      400
    );
  }

  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const workDate = parseDay(row.workDate);
    if (!workDate) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Invalid workDate (use YYYY-MM-DD)",
      });
      continue;
    }

    let kind = "general";
    if (row.kind?.trim()) {
      const kindParsed = officeTaskKindEnum.safeParse(row.kind.trim());
      if (!kindParsed.success) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: `Invalid kind: ${row.kind}`,
        });
        continue;
      }
      kind = kindParsed.data;
    }

    const dueDate = row.dueDate?.trim() ? parseDay(row.dueDate) : null;
    if (row.dueDate?.trim() && !dueDate) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Invalid dueDate (use YYYY-MM-DD)",
      });
      continue;
    }

    let assigneeId: string | undefined;
    let assigneeUnitId: string | undefined;
    if (row.assigneeUnitId?.trim()) {
      const person = await prisma.user.findUnique({
        where: { unitId: row.assigneeUnitId.trim() },
        select: { id: true, unitId: true },
      });
      if (!person) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: `Assignee not found: ${row.assigneeUnitId}`,
        });
        continue;
      }
      assigneeId = person.id;
      assigneeUnitId = person.unitId;
    }

    let caseUnitId: string | undefined;
    if (row.caseUnitId?.trim()) {
      const caseItem = await prisma.case.findUnique({
        where: { unitId: row.caseUnitId.trim() },
        select: { unitId: true },
      });
      if (!caseItem) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: `Case not found: ${row.caseUnitId}`,
        });
        continue;
      }
      caseUnitId = caseItem.unitId;
    }

    if (dryRun) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "ok",
        message: `Will create · ${kind} · ${row.workDate}`,
      });
      continue;
    }

    try {
      const unitId = await nextUnitId("officeTask");
      const created = await prisma.officeTask.create({
        data: {
          unitId,
          title: row.title,
          kind,
          status: "open",
          workDate,
          dueDate: dueDate ?? undefined,
          assigneeUnitId,
          assigneeId,
          caseUnitId,
          notes: row.notes?.trim() || undefined,
          createdById: user.id,
        },
      });

      if (assigneeId && assigneeId !== user.id && assigneeUnitId) {
        scheduleNotify(async () => {
          await notifyUser({
            userId: assigneeId!,
            userUnitId: assigneeUnitId!,
            type: "task_assigned",
            title: `Task assigned: ${created.title}`,
            body: created.notes ?? null,
            href: "/tasks",
            meta: { taskUnitId: created.unitId },
          });
        });
      }

      results.push({
        row: rowNum,
        unitId: created.unitId,
        status: "ok",
        message: "Created",
      });
    } catch {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Failed to save row",
      });
    }
  }

  if (!dryRun) {
    await writeAudit({
      actorUnitId: user.unitId,
      action: "task.import",
      entity: "OfficeTask",
      meta: {
        total: rows.length,
        succeeded: results.filter((r) => r.status === "ok").length,
        failed: results.filter((r) => r.status === "error").length,
      },
    });
  }

  const succeeded = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;
  return jsonOk({
    dryRun,
    total: rows.length,
    succeeded,
    failed,
    results,
  });
});
