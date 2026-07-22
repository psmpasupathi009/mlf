import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { updatePaymentSchema } from "@/lib/validations/accounts.schema";
import { toPaymentSummary } from "@/features/accounts/server/serialize";

export const GET = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "accounts", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId ? await prisma.cashPayment.findUnique({ where: { unitId } }) : null;
  if (!item) return jsonFail("NOT_FOUND", "Payment not found", 404);

  return jsonOk({ payment: toPaymentSummary(item) });
});

export const PATCH = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "accounts", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId ? await prisma.cashPayment.findUnique({ where: { unitId } }) : null;
  if (!item) return jsonFail("NOT_FOUND", "Payment not found", 404);

  if (item.status === "void") {
    return jsonFail("CONFLICT", "This payment has been voided and can’t be edited", 409);
  }

  const raw = await request.json();
  const parsed = updatePaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  const updated = await prisma.cashPayment.update({
    where: { id: item.id },
    data: {
      type: input.type,
      amount: input.amount,
      status: input.status,
      paidOn: input.paidOn,
      notes: input.notes === "" ? null : input.notes,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "payment.update",
    entity: "CashPayment",
    entityUnitId: updated.unitId,
  });

  return jsonOk({ payment: toPaymentSummary(updated) });
});
