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
import { istDayBounds } from "@/lib/utils/ist";

type RowResult = { row: number; unitId: string | null; status: "ok" | "error"; message: string };

const VALID_STATUS = new Set<string>([
  ...CASE_PIPELINE_STATUSES,
  "pending",
  "listed",
]);

function parseDay(value: string | undefined | null) {
  if (!value?.trim()) return undefined;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return istDayBounds(s).start;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "create");
  if (!user) return response;
  const canEdit = await hasPermission(user.id, "cases", "edit");

  const raw = await request.json();
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
      const client = row.clientUnitId
        ? await prisma.client.findUnique({ where: { unitId: row.clientUnitId } })
        : row.clientMobile
          ? await prisma.client.findFirst({
              where: { mobile: normalizeMobile(row.clientMobile) ?? row.clientMobile },
            })
          : null;

      if (!client) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "Client not found (set clientMobile or clientUnitId)",
        });
        continue;
      }

      if (row.caseNumber) {
        const dupe = await prisma.case.findFirst({ where: { caseNumber: row.caseNumber } });
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
        ? await prisma.case.findUnique({ where: { unitId: row.unitId } })
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

      const filingDate = parseDay(row.filingDate);
      if (row.filingDate?.trim() && filingDate === null) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "Invalid filingDate (use YYYY-MM-DD)",
        });
        continue;
      }

      const nextHearingAt = parseDay(row.nextHearingAt);
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

      const advocateMobiles = row.advocateMobiles
        ? row.advocateMobiles.split(";").map((m) => m.trim()).filter(Boolean)
        : [];

      const caseYear = row.caseYear?.trim()
        ? Number(row.caseYear.trim())
        : undefined;
      if (row.caseYear?.trim() && (!caseYear || !Number.isFinite(caseYear))) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "Invalid caseYear",
        });
        continue;
      }

      const sharedData = {
        clientId: client.id,
        clientUnitId: client.unitId,
        caseNumber: row.caseNumber || undefined,
        filingNumber: row.filingNumber || undefined,
        caseYear,
        cnr: row.cnr || undefined,
        state: row.state || undefined,
        district: row.district || undefined,
        city: row.city || undefined,
        courtName: row.courtName || undefined,
        advocateMobiles,
        primaryAdvocateMobile: row.primaryAdvocateMobile || undefined,
        opposingParty: row.opposingParty || undefined,
        ourSide: row.ourSide || undefined,
        underActs: row.underActs || undefined,
        policeStation: row.policeStation || undefined,
        firNumber: row.firNumber || undefined,
        stage: row.stage || undefined,
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
  });
});
