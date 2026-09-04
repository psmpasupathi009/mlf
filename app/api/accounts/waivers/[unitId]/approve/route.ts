import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit, pickAuditFields, diffAudit } from "@/lib/audit";
import { feeRollupForCase } from "@/features/accounts/server/fee-rollup";
import {
  isAdminRole,
  PENDING_WAIVER_STATUS,
} from "@/features/accounts/server/waiver-guards";
import { toWaiverSummary } from "@/features/accounts/server/waiver-serialize";

/** Approve a pending waiver — admin only. */
export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "accounts", "waive");
  if (!user) return response;

  if (!isAdminRole(user)) {
    return jsonFail("FORBIDDEN", "Only admin can approve waivers", 403);
  }

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.feeWaiver.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Waiver not found", 404);

  if (item.status === "void") {
    return jsonFail("CONFLICT", "This waiver is void", 409);
  }
  if (item.status === "approved" || item.status === "active") {
    return jsonFail("CONFLICT", "This waiver is already approved", 409);
  }
  if (item.status !== PENDING_WAIVER_STATUS) {
    return jsonFail("CONFLICT", "Only pending waivers can be approved", 409);
  }

  const fee = await feeRollupForCase(item.caseUnitId);
  if (fee.outstanding == null || fee.outstanding <= 0) {
    return jsonFail(
      "VALIDATION",
      "Nothing outstanding left to waive on this case",
      400
    );
  }
  if (item.amount > fee.outstanding + 1e-9) {
    return jsonFail(
      "VALIDATION",
      `Waiver amount exceeds remaining balance (₹${fee.outstanding.toLocaleString("en-IN")})`,
      400
    );
  }

  const before = pickAuditFields(item as Record<string, unknown>, [
    "status",
    "amount",
    "reason",
  ] as const);

  const updated = await prisma.feeWaiver.update({
    where: { id: item.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: user.id,
    },
  });

  const after = pickAuditFields(updated as Record<string, unknown>, [
    "status",
    "amount",
    "reason",
  ] as const);

  await writeAudit({
    actorUnitId: user.unitId,
    action: "waiver.approve",
    entity: "FeeWaiver",
    entityUnitId: updated.unitId,
    meta: {
      before,
      after,
      changes: diffAudit(before, after),
    },
  });

  const updatedFee = await feeRollupForCase(updated.caseUnitId);
  return jsonOk({ waiver: toWaiverSummary(updated), fee: updatedFee });
});
