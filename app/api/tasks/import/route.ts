import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { compliance } from "@/config/company/compliance";
import { importTasksSchema, officeTaskKindEnum } from "@/lib/validations/tasks.schema";
import { parseIstDateInput } from "@/lib/utils/ist";
import { notifyUser, scheduleNotify } from "@/lib/notifications/notify";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";
import { findCaseByUnitId, findUserByUnitId } from "@/lib/imports/lookups";
import {
  findIgnoredImportColumns,
  IMPORT_TASK_COLUMNS,
} from "@/lib/imports/columns";

type RowResult = {
  row: number;
  unitId: string | null;
  status: "ok" | "error";
  message: string;
};

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "tasks", "create");
  if (!user) return response;

  const limited = await assertImportRateLimit(request, user.unitId);
  if (limited) return limited;

  const raw = await request.json();
  const ignoredColumns = Array.isArray(raw?.rows)
    ? findIgnoredImportColumns(raw.rows as Record<string, string>[], IMPORT_TASK_COLUMNS)
    : [];
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
    const row = rows[i]!;
    const rowNum = i + 2;

    const workDate = parseIstDateInput(row.workDate);
    if (!workDate) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Invalid workDate (use YYYY-MM-DD)",
      });
      continue;
    }

    let kind = "allotment";
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

    let assigneeId: string | undefined;
    let assigneeUnitId: string | undefined;
    if (row.assigneeUnitId?.trim()) {
      const person = await findUserByUnitId(row.assigneeUnitId);
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
      const caseItem = await findCaseByUnitId(row.caseUnitId);
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
          assigneeUnitId,
          assigneeId,
          caseUnitId,
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
            body: null,
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
    ignoredColumns,
  });
});
