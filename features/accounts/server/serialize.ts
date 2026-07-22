import type { CashPayment } from "@prisma/client";

export type PaymentSummary = {
  unitId: string;
  clientUnitId: string;
  caseUnitId: string | null;
  type: string;
  amount: number;
  status: string;
  paidOn: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export function toPaymentSummary(item: CashPayment): PaymentSummary {
  return {
    unitId: item.unitId,
    clientUnitId: item.clientUnitId,
    caseUnitId: item.caseUnitId,
    type: item.type,
    amount: item.amount,
    status: item.status,
    paidOn: item.paidOn ? item.paidOn.toISOString() : null,
    notes: item.notes,
    voidedAt: item.voidedAt ? item.voidedAt.toISOString() : null,
    voidReason: item.voidReason,
    createdAt: item.createdAt.toISOString(),
  };
}
