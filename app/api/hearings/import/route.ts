import { createImportHandler } from "@/lib/imports/run-import";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { importHearingsSchema } from "@/lib/validations/cases.schema";
import { parseIstDateInput } from "@/lib/utils/ist";
import { findCaseByUnitId } from "@/lib/imports/lookups";
import { IMPORT_HEARING_COLUMNS } from "@/lib/imports/columns";

export const POST = createImportHandler({
  perm: ["cases", "edit"],
  schema: importHearingsSchema,
  columns: IMPORT_HEARING_COLUMNS,
  audit: { action: "hearings.import", entity: "Hearing" },
  async processRows(rows, { user, dryRun }) {
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2;

      try {
        const caseItem = await findCaseByUnitId(row.caseUnitId);
        if (!caseItem) {
          results.push({
            row: rowNum,
            unitId: null,
            status: "error" as const,
            message: "Case not found (set caseUnitId)",
          });
          continue;
        }

        const hearingDate = parseIstDateInput(row.hearingDate);
        if (!hearingDate) {
          results.push({
            row: rowNum,
            unitId: null,
            status: "error" as const,
            message: "Invalid hearingDate (use YYYY-MM-DD)",
          });
          continue;
        }

        if (dryRun) {
          results.push({
            row: rowNum,
            unitId: null,
            status: "ok" as const,
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
              ...((caseItem.status === "pending" ||
                caseItem.status === "listed") &&
              (caseItem.caseNumber || caseItem.cnr)
                ? { status: "active" as const }
                : {}),
            },
          }),
        ]);

        results.push({
          row: rowNum,
          unitId: hearing.unitId,
          status: "ok" as const,
          message: "Created",
        });
      } catch (err) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error" as const,
          message: err instanceof Error ? err.message : "Import failed",
        });
      }
    }

    return results;
  },
});
