import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { importHearingsSchema } from "@/lib/validations/cases.schema";
import { compliance } from "@/config/company/compliance";
import { parseIstDateInput } from "@/lib/utils/ist";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";
import { findCaseByUnitId } from "@/lib/imports/lookups";
import {
  findIgnoredImportColumns,
  IMPORT_HEARING_COLUMNS,
} from "@/lib/imports/columns";

type RowResult = {
  row: number;
  unitId: string | null;
  status: "ok" | "error";
  message: string;
};

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "edit");
  if (!user) return response;

  const limited = await assertImportRateLimit(request, user.unitId);
  if (limited) return limited;

  const raw = await request.json();
  const ignoredColumns = Array.isArray(raw?.rows)
    ? findIgnoredImportColumns(raw.rows as Record<string, string>[], IMPORT_HEARING_COLUMNS)
    : [];
  const parsed = importHearingsSchema.safeParse(raw);
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

    try {
      const caseItem = await findCaseByUnitId(row.caseUnitId);
      if (!caseItem) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: "Case not found (set caseUnitId)",
        });
        continue;
      }

      const hearingDate = parseIstDateInput(row.hearingDate);
      if (!hearingDate) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: "Invalid hearingDate (use YYYY-MM-DD)",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "ok",
          message: `Will create hearing for ${caseItem.unitId}`,
        });
        continue;
      }

      const unitId = await nextUnitId("hearing");
      const [hearing] = await prisma.$transaction([
        prisma.hearing.create({
          data: {
            unitId,
            caseId: caseItem.id,
            caseUnitId: caseItem.unitId,
            hearingDate,
            purpose: row.purpose || undefined,
            notes: row.notes || undefined,
            createdById: user.id,
          },
        }),
        prisma.case.update({
          where: { id: caseItem.id },
          data: {
            nextHearingAt: hearingDate,
            ...((caseItem.status === "pending" || caseItem.status === "listed") &&
            (caseItem.caseNumber || caseItem.cnr)
              ? { status: "active" as const }
              : {}),
          },
        }),
      ]);

      results.push({
        row: rowNum,
        unitId: hearing.unitId,
        status: "ok",
        message: "Created",
      });
    } catch (err) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: err instanceof Error ? err.message : "Import failed",
      });
    }
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  const errCount = results.filter((r) => r.status === "error").length;

  if (!dryRun && okCount > 0) {
    await writeAudit({
      actorUnitId: user.unitId,
      action: "hearings.import",
      entity: "Hearing",
      meta: { ok: okCount, errors: errCount, dryRun },
    });
  }

  return jsonOk({
    dryRun,
    total: rows.length,
    succeeded: okCount,
    failed: errCount,
    results,
    ignoredColumns,
  });
});
