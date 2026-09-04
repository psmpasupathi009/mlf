import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { FEE_PURPOSES } from "@/features/accounts/lib/payment-purposes";
import {
  APPROVED_WAIVER_STATUSES,
  PENDING_WAIVER_STATUS,
} from "@/features/accounts/server/waiver-guards";

export type FeeSettlement = "none" | "partial" | "paid";

export type FeeRollup = {
  agreedFee: number | null;
  collected: number;
  waived: number;
  /** Pending waiver total — reserved, not yet reducing outstanding. */
  pendingWaived: number;
  outstanding: number | null;
  settlement: FeeSettlement;
};

function deriveSettlement(
  agreedFee: number | null,
  collected: number,
  waived: number,
  outstanding: number | null
): FeeSettlement {
  if (agreedFee == null || outstanding == null) return "none";
  if (outstanding === 0 && (collected > 0 || waived > 0 || agreedFee === 0)) {
    return "paid";
  }
  if (collected > 0 || waived > 0) return "partial";
  return "none";
}

function buildRollup(
  agreedFee: number | null,
  collected: number,
  waived: number,
  pendingWaived: number
): FeeRollup {
  const outstanding =
    agreedFee != null ? Math.max(0, agreedFee - collected - waived) : null;
  return {
    agreedFee,
    collected,
    waived,
    pendingWaived,
    outstanding,
    settlement: deriveSettlement(agreedFee, collected, waived, outstanding),
  };
}

/** Paid fee-purpose totals for a case (excludes actuals and void). */
export async function feeRollupForCase(
  caseUnitId: string,
  extraWhere?: Prisma.CashPaymentWhereInput
): Promise<FeeRollup> {
  const caseItem = await prisma.case.findUnique({
    where: { unitId: caseUnitId },
    select: { agreedFee: true },
  });

  const where: Prisma.CashPaymentWhereInput = {
    caseUnitId,
    status: "paid",
    type: { in: [...FEE_PURPOSES] },
    ...extraWhere,
  };

  const [agg, waiverAgg, pendingAgg] = await Promise.all([
    prisma.cashPayment.aggregate({
      where,
      _sum: { amount: true },
    }),
    prisma.feeWaiver.aggregate({
      where: {
        caseUnitId,
        status: { in: [...APPROVED_WAIVER_STATUSES] },
      },
      _sum: { amount: true },
    }),
    prisma.feeWaiver.aggregate({
      where: { caseUnitId, status: PENDING_WAIVER_STATUS },
      _sum: { amount: true },
    }),
  ]);

  return buildRollup(
    caseItem?.agreedFee ?? null,
    agg._sum.amount ?? 0,
    waiverAgg._sum.amount ?? 0,
    pendingAgg._sum.amount ?? 0
  );
}

/**
 * Remaining fee capacity for a case, subtracting pending fee payments
 * and pending waivers so concurrent rows cannot over-collect.
 */
export async function feeRemainingForCase(
  caseUnitId: string,
  opts?: { excludePaymentId?: string }
): Promise<number | null> {
  const fee = await feeRollupForCase(caseUnitId);
  if (fee.outstanding == null) return null;

  const pendingFees = await prisma.cashPayment.aggregate({
    where: {
      caseUnitId,
      status: "pending",
      type: { in: [...FEE_PURPOSES] },
      ...(opts?.excludePaymentId ? { id: { not: opts.excludePaymentId } } : {}),
    },
    _sum: { amount: true },
  });

  return Math.max(
    0,
    fee.outstanding - (pendingFees._sum.amount ?? 0) - fee.pendingWaived
  );
}

/** Paid fee-purpose totals across all matters for a client. */
export async function feeRollupForClient(
  clientUnitId: string
): Promise<FeeRollup> {
  const cases = await prisma.case.findMany({
    where: { clientUnitId },
    select: { agreedFee: true },
  });

  const [agg, waiverAgg, pendingAgg] = await Promise.all([
    prisma.cashPayment.aggregate({
      where: {
        clientUnitId,
        status: "paid",
        type: { in: [...FEE_PURPOSES] },
      },
      _sum: { amount: true },
    }),
    prisma.feeWaiver.aggregate({
      where: {
        clientUnitId,
        status: { in: [...APPROVED_WAIVER_STATUSES] },
      },
      _sum: { amount: true },
    }),
    prisma.feeWaiver.aggregate({
      where: { clientUnitId, status: PENDING_WAIVER_STATUS },
      _sum: { amount: true },
    }),
  ]);

  const collected = agg._sum.amount ?? 0;
  const waived = waiverAgg._sum.amount ?? 0;
  const pendingWaived = pendingAgg._sum.amount ?? 0;
  const agreedParts = cases
    .map((c) => c.agreedFee)
    .filter((n): n is number => n != null);
  const agreedFee =
    agreedParts.length > 0
      ? agreedParts.reduce((sum, n) => sum + n, 0)
      : null;

  return buildRollup(agreedFee, collected, waived, pendingWaived);
}
