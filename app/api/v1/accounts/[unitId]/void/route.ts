import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { voidPaymentSchema } from "@/lib/validations/accounts.schema";
import { toPaymentSummary } from "@/features/accounts/server/serialize";

/** Void, never delete — cash entries stay in the audit trail forever. */
export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "accounts", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId ? await prisma.cashPayment.findUnique({ where: { unitId } }) : null;
  if (!item) return jsonFail("NOT_FOUND", "Payment not found", 404);

  if (item.status === "void") {
    return jsonFail("CONFLICT", "This payment is already void", 409);
  }

  const raw = await request.json();
  const parsed = voidPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }

  const updated = await prisma.cashPayment.update({
    where: { id: item.id },
    data: {
      status: "void",
      voidedAt: new Date(),
      voidedById: user.id,
      voidReason: parsed.data.reason,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "payment.void",
    entity: "CashPayment",
    entityUnitId: updated.unitId,
    meta: { reason: parsed.data.reason },
  });

  return jsonOk({ payment: toPaymentSummary(updated) });
});
