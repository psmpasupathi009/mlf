import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
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

type RowResult = { row: number; unitId: string | null; status: "ok" | "error"; message: string };

const VALID_STATUS = new Set<string>([
  ...CASE_PIPELINE_STATUSES,
  "pending",
  "listed",
]);

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "create");
  if (!user) return response;

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
    const row = rows[i];
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
        results.push({ row: rowNum, unitId: row.unitId || null, status: "error", message: "Client not found (set clientMobile or clientUnitId)" });
        continue;
      }

      if (row.caseNumber) {
        const dupe = await prisma.case.findFirst({ where: { caseNumber: row.caseNumber } });
        if (dupe && dupe.unitId !== row.unitId) {
          results.push({ row: rowNum, unitId: row.unitId || null, status: "error", message: "Case number already exists" });
          continue;
        }
      }

      const existingByUnitId = row.unitId
        ? await prisma.case.findUnique({ where: { unitId: row.unitId } })
        : null;

      const status: CaseStatus =
        row.status && VALID_STATUS.has(row.status)
          ? (normalizeCaseStatus(row.status) as CaseStatus)
          : "enquiry";
      const filingDate = row.filingDate ? new Date(row.filingDate) : undefined;
      const nextHearingAt = row.nextHearingAt ? new Date(row.nextHearingAt) : undefined;
      const agreedFee = row.agreedFee ? Number(row.agreedFee) : undefined;
      const advocateMobiles = row.advocateMobiles
        ? row.advocateMobiles.split(";").map((m) => m.trim()).filter(Boolean)
        : [];

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
          data: {
            clientId: client.id,
            clientUnitId: client.unitId,
            caseNumber: row.caseNumber || undefined,
            cnr: row.cnr || undefined,
            state: row.state || undefined,
            district: row.district || undefined,
            city: row.city || undefined,
            courtName: row.courtName || undefined,
            advocateMobiles,
            primaryAdvocateMobile: row.primaryAdvocateMobile || undefined,
            opposingParty: row.opposingParty || undefined,
            caseType: row.caseType || undefined,
            status,
            filingDate,
            nextHearingAt,
            agreedFee,
            notes: row.notes || undefined,
          },
        });
        results.push({ row: rowNum, unitId: updated.unitId, status: "ok", message: "Updated" });
      } else {
        const unitId = await nextUnitId("case");
        const created = await prisma.case.create({
          data: {
            unitId,
            clientId: client.id,
            clientUnitId: client.unitId,
            caseNumber: row.caseNumber || undefined,
            cnr: row.cnr || undefined,
            state: row.state || undefined,
            district: row.district || undefined,
            city: row.city || undefined,
            courtName: row.courtName || undefined,
            advocateMobiles,
            primaryAdvocateMobile: row.primaryAdvocateMobile || undefined,
            opposingParty: row.opposingParty || undefined,
            caseType: row.caseType || undefined,
            status,
            filingDate,
            nextHearingAt,
            agreedFee,
            notes: row.notes || undefined,
            createdById: user.id,
          },
        });
        results.push({ row: rowNum, unitId: created.unitId, status: "ok", message: "Created" });
      }
    } catch {
      results.push({ row: rowNum, unitId: row.unitId || null, status: "error", message: "Failed to save row" });
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
