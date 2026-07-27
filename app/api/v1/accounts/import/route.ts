import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { importPaymentsSchema } from "@/lib/validations/accounts.schema";
import { compliance } from "@/config/company/compliance";
import { isPaymentPurpose } from "@/features/accounts/lib/payment-purposes";
import type { PaymentStatus, PaymentType } from "@prisma/client";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";

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
    const row = rows[i];
    const rowNum = i + 2;

    if (!isPaymentPurpose(row.type)) {
      results.push({
        row: rowNum,
        unitId: row.unitId || null,
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
        unitId: row.unitId || null,
        status: "error",
        message: "Invalid amount",
      });
      continue;
    }
    if (type === "other" && !row.notes?.trim()) {
      results.push({
        row: rowNum,
        unitId: row.unitId || null,
        status: "error",
        message: "Notes required for Other purpose",
      });
      continue;
    }

    try {
      const client = row.clientUnitId
        ? await prisma.client.findUnique({ where: { unitId: row.clientUnitId } })
        : row.clientMobile
          ? await prisma.client.findFirst({
              where: {
                mobile:
                  normalizeMobile(row.clientMobile) ?? row.clientMobile,
              },
            })
          : null;

      if (!client) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "Client not found",
        });
        continue;
      }

      let caseUnitId: string | undefined;
      let caseId: string | undefined;
      if (row.caseUnitId || row.caseNumber) {
        const caseItem = row.caseUnitId
          ? await prisma.case.findUnique({ where: { unitId: row.caseUnitId } })
          : await prisma.case.findFirst({
              where: { caseNumber: row.caseNumber },
            });
        if (!caseItem) {
          results.push({
            row: rowNum,
            unitId: row.unitId || null,
            status: "error",
            message: "Case not found",
          });
          continue;
        }
        if (caseItem.clientUnitId !== client.unitId) {
          results.push({
            row: rowNum,
            unitId: row.unitId || null,
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
            unitId: row.unitId || null,
            status: "error",
            message: "Void status not allowed via import",
          });
          continue;
        }
        if (!VALID_STATUS.has(rawStatus)) {
          results.push({
            row: rowNum,
            unitId: row.unitId || null,
            status: "error",
            message: "Invalid status (use pending or paid)",
          });
          continue;
        }
        status = rawStatus;
      }

      const paidOnRaw = row.paidOn ? new Date(row.paidOn) : null;
      const paidOn =
        status === "paid"
          ? paidOnRaw && !Number.isNaN(paidOnRaw.getTime())
            ? paidOnRaw
            : null
          : null;
      if (status === "paid" && !paidOn) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "paidOn required when status is paid",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
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
        unitId: row.unitId || null,
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
  });
});
