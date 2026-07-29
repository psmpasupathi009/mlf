import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { compliance } from "@/config/company/compliance";
import {
  dakDirectionEnum,
  importDakSchema,
} from "@/lib/validations/dak.schema";
import { parseIstDateInput } from "@/lib/utils/ist";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";
import { findCaseByUnitId, findClientByUnitId } from "@/lib/imports/lookups";
import {
  findIgnoredImportColumns,
  IMPORT_DAK_COLUMNS,
} from "@/lib/imports/columns";

type RowResult = {
  row: number;
  unitId: string | null;
  status: "ok" | "error";
  message: string;
};

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "dak", "create");
  if (!user) return response;

  const limited = await assertImportRateLimit(request, user.unitId);
  if (limited) return limited;

  const raw = await request.json();
  const ignoredColumns = Array.isArray(raw?.rows)
    ? findIgnoredImportColumns(raw.rows as Record<string, string>[], IMPORT_DAK_COLUMNS)
    : [];
  const parsed = importDakSchema.safeParse(raw);
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

    const directionParsed = dakDirectionEnum.safeParse(
      row.direction.trim().toLowerCase()
    );
    if (!directionParsed.success) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "direction must be in or out",
      });
      continue;
    }

    const entryDate = parseIstDateInput(row.entryDate);
    if (!entryDate) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Invalid entryDate (use YYYY-MM-DD)",
      });
      continue;
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

    let clientUnitId: string | undefined;
    if (row.clientUnitId?.trim()) {
      const client = await findClientByUnitId(row.clientUnitId);
      if (!client) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: `Client not found: ${row.clientUnitId}`,
        });
        continue;
      }
      clientUnitId = client.unitId;
    }

    if (dryRun) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "ok",
        message: `Will create · ${directionParsed.data}`,
      });
      continue;
    }

    try {
      const unitId = await nextUnitId("dak");
      const created = await prisma.dakEntry.create({
        data: {
          unitId,
          direction: directionParsed.data,
          entryDate,
          subject: row.subject,
          fromTo: row.fromTo?.trim() || undefined,
          caseUnitId,
          clientUnitId,
          notes: row.notes?.trim() || undefined,
          createdById: user.id,
        },
      });
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
      action: "dak.import",
      entity: "DakEntry",
      meta: {
        total: rows.length,
        succeeded: results.filter((r) => r.status === "ok").length,
        failed: results.filter((r) => r.status === "error").length,
      },
    });
  }

  return jsonOk({
    dryRun,
    total: rows.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
    ignoredColumns,
  });
});
