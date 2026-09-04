import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit, pickAuditFields, diffAudit } from "@/lib/audit";
import { voidWaiverSchema } from "@/lib/validations/accounts.schema";
import { feeRollupForCase } from "@/features/accounts/server/fee-rollup";
import {
  isAdminRole,
  isWaiverRole,
  PENDING_WAIVER_STATUS,
} from "@/features/accounts/server/waiver-guards";
import { toWaiverSummary } from "@/features/accounts/server/waiver-serialize";

/**
 * Void a waiver — never delete.
 * - Admin: any non-void waiver
 * - Sub admin: own pending requests only
 */
export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "accounts", "waive");
  if (!user) return response;

  if (!isWaiverRole(user)) {
    return jsonFail("FORBIDDEN", "Only admin or sub admin can void waivers", 403);
  }

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.feeWaiver.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Waiver not found", 404);

  if (item.status === "void") {
    return jsonFail("CONFLICT", "This waiver is already void", 409);
  }

  const asAdmin = isAdminRole(user);
  if (!asAdmin) {
    if (item.status !== PENDING_WAIVER_STATUS) {
      return jsonFail(
        "FORBIDDEN",
        "Sub admin can only cancel pending waiver requests",
        403
      );
    }
    if (item.createdById !== user.id) {
      return jsonFail(
        "FORBIDDEN",
        "You can only cancel your own pending waiver requests",
        403
      );
    }
  }

  const raw = await request.json();
  const parsed = voidWaiverSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }

  const before = pickAuditFields(item as Record<string, unknown>, [
    "status",
    "amount",
    "reason",
    "voidReason",
  ] as const);

  const updated = await prisma.feeWaiver.update({
    where: { id: item.id },
    data: {
      status: "void",
      voidedAt: new Date(),
      voidedById: user.id,
      voidReason: parsed.data.reason,
    },
  });

  const after = pickAuditFields(updated as Record<string, unknown>, [
    "status",
    "amount",
    "reason",
    "voidReason",
  ] as const);

  await writeAudit({
    actorUnitId: user.unitId,
    action: "waiver.void",
    entity: "FeeWaiver",
    entityUnitId: updated.unitId,
    meta: {
      before,
      after,
      changes: diffAudit(before, after),
      reason: parsed.data.reason,
    },
  });

  const fee = await feeRollupForCase(updated.caseUnitId);
  return jsonOk({ waiver: toWaiverSummary(updated), fee });
});
