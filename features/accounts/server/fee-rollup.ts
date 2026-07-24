import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { FEE_PURPOSES } from "@/features/accounts/lib/payment-purposes";

export type FeeRollup = {
  agreedFee: number | null;
  collected: number;
  outstanding: number | null;
};

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

  const agg = await prisma.cashPayment.aggregate({
    where,
    _sum: { amount: true },
  });

  const collected = agg._sum.amount ?? 0;
  const agreedFee = caseItem?.agreedFee ?? null;
  const outstanding =
    agreedFee != null ? Math.max(0, agreedFee - collected) : null;

  return { agreedFee, collected, outstanding };
}
