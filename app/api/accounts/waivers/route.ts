import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit, pickAuditFields } from "@/lib/audit";
import { createWaiverSchema } from "@/lib/validations/accounts.schema";
import { feeRollupForCase } from "@/features/accounts/server/fee-rollup";
import {
  isAdminRole,
  isWaiverRole,
  PENDING_WAIVER_STATUS,
} from "@/features/accounts/server/waiver-guards";
import { toWaiverSummary } from "@/features/accounts/server/waiver-serialize";
import { resolveActorsByIds } from "@/features/accounts/server/actors";

/** List waivers for a case (pending / approved / void). */
export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "accounts", "view");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const caseUnitId = searchParams.get("caseUnitId")?.trim();
  if (!caseUnitId) {
    return jsonFail("VALIDATION", "caseUnitId is required", 400);
  }

  const rows = await prisma.feeWaiver.findMany({
    where: { caseUnitId },
    orderBy: { createdAt: "desc" },
  });

  const actorMap = await resolveActorsByIds(
    rows.flatMap((r) => [r.createdById, r.approvedById, r.voidedById])
  );

  const data = rows.map((r) =>
    toWaiverSummary(r, {
      createdBy: r.createdById ? actorMap.get(r.createdById) ?? null : null,
      approvedBy: r.approvedById ? actorMap.get(r.approvedById) ?? null : null,
      voidedBy: r.voidedById ? actorMap.get(r.voidedById) ?? null : null,
    })
  );

  const fee = await feeRollupForCase(caseUnitId);
  return jsonOk({ waivers: data, fee });
});

/**
 * Create a fee waiver.
 * - Admin: applied immediately (approved).
 * - Sub admin: pending until admin approves.
 */
export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "accounts", "waive");
  if (!user) return response;

  if (!isWaiverRole(user)) {
    return jsonFail("FORBIDDEN", "Only admin or sub admin can request waivers", 403);
  }

  const raw = await request.json();
  const parsed = createWaiverSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const input = parsed.data;

  const caseItem = await prisma.case.findUnique({
    where: { unitId: input.caseUnitId },
  });
  if (!caseItem) return jsonFail("VALIDATION", "Case not found", 400);
  if (caseItem.agreedFee == null) {
    return jsonFail(
      "VALIDATION",
      "Set the case fee before applying a waiver",
      400
    );
  }

  const fee = await feeRollupForCase(caseItem.unitId);
  if (fee.outstanding == null || fee.outstanding <= 0) {
    return jsonFail("VALIDATION", "Nothing outstanding to waive on this case", 400);
  }

  const available = Math.max(0, fee.outstanding - fee.pendingWaived);
  if (available <= 0) {
    return jsonFail(
      "VALIDATION",
      "Outstanding balance is already covered by pending waiver requests",
      400
    );
  }
  if (input.amount > available + 1e-9) {
    return jsonFail(
      "VALIDATION",
      `Waiver cannot exceed available balance (₹${available.toLocaleString("en-IN")} after pending requests)`,
      400
    );
  }

  const asAdmin = isAdminRole(user);
  const now = new Date();
  const unitId = await nextUnitId("waiver");
  const created = await prisma.feeWaiver.create({
    data: {
      unitId,
      clientId: caseItem.clientId,
      clientUnitId: caseItem.clientUnitId,
      caseId: caseItem.id,
      caseUnitId: caseItem.unitId,
      amount: input.amount,
      reason: input.reason,
      status: asAdmin ? "approved" : PENDING_WAIVER_STATUS,
      approvedAt: asAdmin ? now : null,
      approvedById: asAdmin ? user.id : null,
      createdById: user.id,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: asAdmin ? "waiver.create" : "waiver.request",
    entity: "FeeWaiver",
    entityUnitId: created.unitId,
    meta: {
      after: pickAuditFields(created as Record<string, unknown>, [
        "clientUnitId",
        "caseUnitId",
        "amount",
        "reason",
        "status",
      ] as const),
    },
  });

  if (!asAdmin) {
    const { scheduleNotify, notifyUsers } = await import(
      "@/lib/notifications/notify"
    );
    scheduleNotify(async () => {
      const admins = await prisma.user.findMany({
        where: { isActive: true, roles: { has: "admin" } },
        select: { id: true, unitId: true },
      });
      await notifyUsers(
        admins
          .filter((u) => u.id !== user.id)
          .map((u) => ({
            userId: u.id,
            userUnitId: u.unitId,
            type: "waiver_pending",
            title: "Waiver awaiting approval",
            body: `₹${created.amount.toLocaleString("en-IN")} on ${created.caseUnitId}`,
            href: `/cases/${created.caseUnitId}`,
            meta: { waiverUnitId: created.unitId },
          }))
      );
    });
  }

  const updatedFee = await feeRollupForCase(caseItem.unitId);
  return jsonOk({ waiver: toWaiverSummary(created), fee: updatedFee }, 201);
});
