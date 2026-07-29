import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { importCasesSchema } from "@/lib/validations/cases.schema";
import { compliance } from "@/config/company/compliance";
import type { CaseStatus } from "@prisma/client";
import {
  CASE_PIPELINE_STATUSES,
  normalizeCaseStatus,
} from "@/config/company/case-pipeline";
import { parseIstDateInput } from "@/lib/utils/ist";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";
import { findCaseByUnitId, findClientByUnitId } from "@/lib/imports/lookups";
import {
  findIgnoredImportColumns,
  IMPORT_CASE_COLUMNS,
} from "@/lib/imports/columns";

type RowResult = { row: number; unitId: string | null; status: "ok" | "error"; message: string };

const VALID_STATUS = new Set<string>([
  ...CASE_PIPELINE_STATUSES,
  "pending",
  "listed",
]);

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "create");
  if (!user) return response;

  const limited = await assertImportRateLimit(request, user.unitId);
  if (limited) return limited;
  const canEdit = await hasPermission(user.id, "cases", "edit");

  const raw = await request.json();
  const ignoredColumns = Array.isArray(raw?.rows)
    ? findIgnoredImportColumns(raw.rows as Record<string, string>[], IMPORT_CASE_COLUMNS)
    : [];
  const parsed = importCasesSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const { dryRun, rows } = parsed.data;

  if (rows.length > compliance.csv.maxRows) {
    return jsonFail("VALIDATION", `Max ${compliance.csv.maxRows} rows per import`, 400);
  }

  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    try {
      const client = await findClientByUnitId(row.clientUnitId);
      if (!client) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "Client not found (set clientUnitId)",
        });
        continue;
      }

      if (row.caseNumber) {
        const dupe = await prisma.case.findFirst({
          where: { caseNumber: row.caseNumber },
          select: { unitId: true },
        });
        if (dupe && dupe.unitId !== row.unitId) {
          results.push({
            row: rowNum,
            unitId: row.unitId || null,
            status: "error",
            message: "Case number already exists",
          });
          continue;
        }
      }

      const existingByUnitId = row.unitId
        ? await findCaseByUnitId(row.unitId)
        : null;

      if (row.unitId?.trim() && !existingByUnitId) {
        results.push({
          row: rowNum,
          unitId: row.unitId,
          status: "error",
          message: "Case unitId not found (remove unitId to create a new case)",
        });
        continue;
      }

      if (existingByUnitId && !canEdit) {
        results.push({
          row: rowNum,
          unitId: existingByUnitId.unitId,
          status: "error",
          message: "Updating existing cases requires cases.edit",
        });
        continue;
      }

      if (row.status?.trim() && !VALID_STATUS.has(row.status.trim())) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: `Invalid status: ${row.status}`,
        });
        continue;
      }

      const status: CaseStatus = row.status?.trim()
        ? (normalizeCaseStatus(row.status.trim()) as CaseStatus)
        : "enquiry";

      const filingDate = row.filingDate?.trim()
        ? parseIstDateInput(row.filingDate)
        : undefined;
      if (row.filingDate?.trim() && filingDate === null) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "Invalid filingDate (use YYYY-MM-DD)",
        });
        continue;
      }

      const nextHearingAt = row.nextHearingAt?.trim()
        ? parseIstDateInput(row.nextHearingAt)
        : undefined;
      if (row.nextHearingAt?.trim() && nextHearingAt === null) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "Invalid nextHearingAt (use YYYY-MM-DD)",
        });
        continue;
      }

      let agreedFee: number | undefined;
      if (row.agreedFee?.trim()) {
        agreedFee = Number(row.agreedFee);
        if (!Number.isFinite(agreedFee)) {
          results.push({
            row: rowNum,
            unitId: row.unitId || null,
            status: "error",
            message: "Invalid agreedFee",
          });
          continue;
        }
      }

      const primaryAdvocateMobile = row.primaryAdvocateMobile?.trim()
        ? normalizeMobile(row.primaryAdvocateMobile) ?? row.primaryAdvocateMobile.trim()
        : undefined;

      const sharedData = {
        clientId: client.id,
        clientUnitId: client.unitId,
        caseNumber: row.caseNumber || undefined,
        cnr: row.cnr || undefined,
        courtName: row.courtName || undefined,
        primaryAdvocateMobile,
        advocateMobiles: primaryAdvocateMobile ? [primaryAdvocateMobile] : [],
        caseType: row.caseType || undefined,
        status,
        filingDate: filingDate ?? undefined,
        nextHearingAt: nextHearingAt ?? undefined,
        agreedFee,
        notes: row.notes || undefined,
      };

      if (dryRun) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "ok",
          message: existingByUnitId ? "Will update" : "Will create",
        });
        continue;
      }

      if (existingByUnitId) {
        const updated = await prisma.case.update({
          where: { id: existingByUnitId.id },
          data: sharedData,
        });
        results.push({ row: rowNum, unitId: updated.unitId, status: "ok", message: "Updated" });
      } else {
        const unitId = await nextUnitId("case");
        const created = await prisma.case.create({
          data: {
            unitId,
            ...sharedData,
            createdById: user.id,
          },
        });
        results.push({ row: rowNum, unitId: created.unitId, status: "ok", message: "Created" });
      }
    } catch {
      results.push({
        row: rowNum,
        unitId: row.unitId || null,
        status: "error",
        message: "Failed to save row",
      });
    }
  }

  if (!dryRun) {
    await writeAudit({
      actorUnitId: user.unitId,
      action: "case.import",
      entity: "Case",
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
