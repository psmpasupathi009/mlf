import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { importPaymentsSchema } from "@/lib/validations/accounts.schema";
import { compliance } from "@/config/company/compliance";
import { isPaymentPurpose } from "@/features/accounts/lib/payment-purposes";
import type { PaymentStatus, PaymentType } from "@prisma/client";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";
import {
  caseBelongsToClient,
  findCaseByUnitId,
  findClientByUnitId,
} from "@/lib/imports/lookups";
import {
  findIgnoredImportColumns,
  IMPORT_PAYMENT_COLUMNS,
} from "@/lib/imports/columns";
import { parseIstDateInput } from "@/lib/utils/ist";

type RowResult = {
  row: number;
  unitId: string | null;
  status: "ok" | "error";
  message: string;
};

const VALID_STATUS = new Set<PaymentStatus>(["pending", "paid"]);

/** Bulk import for opening balances — void is never allowed via CSV. Uses accounts.upload. */
export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "accounts", "upload");
  if (!user) return response;

  const limited = await assertImportRateLimit(request, user.unitId);
  if (limited) return limited;

  const raw = await request.json();
  const ignoredColumns = Array.isArray(raw?.rows)
    ? findIgnoredImportColumns(raw.rows as Record<string, string>[], IMPORT_PAYMENT_COLUMNS)
    : [];
  const parsed = importPaymentsSchema.safeParse(raw);
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
  const createdUnitIds: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    if (!isPaymentPurpose(row.type)) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Invalid payment type",
      });
      continue;
    }
    const type = row.type as PaymentType;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Invalid amount",
      });
      continue;
    }
    if (type === "other" && !row.notes?.trim()) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Notes required for Other purpose",
      });
      continue;
    }

    try {
      const client = await findClientByUnitId(row.clientUnitId);
      if (!client) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: "Client not found (set clientUnitId)",
        });
        continue;
      }

      let caseUnitId: string | undefined;
      let caseId: string | undefined;
      if (row.caseUnitId?.trim()) {
        const caseItem = await findCaseByUnitId(row.caseUnitId);
        if (!caseItem) {
          results.push({
            row: rowNum,
            unitId: null,
            status: "error",
            message: "Case not found",
          });
          continue;
        }
        if (!caseBelongsToClient(caseItem, client.unitId)) {
          results.push({
            row: rowNum,
            unitId: null,
            status: "error",
            message: "Case does not belong to client",
          });
          continue;
        }
        caseId = caseItem.id;
        caseUnitId = caseItem.unitId;
      }

      let status: PaymentStatus = "pending";
      if (row.status?.trim()) {
        const rawStatus = row.status.trim().toLowerCase() as PaymentStatus;
        if (rawStatus === "void") {
          results.push({
            row: rowNum,
            unitId: null,
            status: "error",
            message: "Void status not allowed via import",
          });
          continue;
        }
        if (!VALID_STATUS.has(rawStatus)) {
          results.push({
            row: rowNum,
            unitId: null,
            status: "error",
            message: "Invalid status (use pending or paid)",
          });
          continue;
        }
        status = rawStatus;
      }

      const paidOn =
        status === "paid"
          ? row.paidOn?.trim()
            ? parseIstDateInput(row.paidOn)
            : null
          : null;
      if (status === "paid" && !paidOn) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: "paidOn required when status is paid (YYYY-MM-DD)",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "ok",
          message: "Will create",
        });
        continue;
      }

      const unitId = await nextUnitId("payment");
      const created = await prisma.cashPayment.create({
        data: {
          unitId,
          clientId: client.id,
          clientUnitId: client.unitId,
          caseId,
          caseUnitId,
          type,
          amount,
          status,
          paidOn,
          notes: row.notes || undefined,
          createdById: user.id,
        },
      });

      createdUnitIds.push(created.unitId);
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
      action: "payment.import",
      entity: "CashPayment",
      meta: {
        total: rows.length,
        succeeded: results.filter((r) => r.status === "ok").length,
        failed: results.filter((r) => r.status === "error").length,
        unitIds: createdUnitIds.slice(0, 100),
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
