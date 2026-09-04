import type { FeeWaiver } from "@prisma/client";
import type { PaymentActor } from "@/features/accounts/server/serialize";

export type WaiverSummary = {
  unitId: string;
  clientUnitId: string;
  caseUnitId: string;
  amount: number;
  reason: string;
  status: string;
  approvedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: PaymentActor | null;
  approvedBy: PaymentActor | null;
  voidedBy: PaymentActor | null;
};

export function toWaiverSummary(
  item: FeeWaiver,
  actors?: {
    createdBy?: PaymentActor | null;
    approvedBy?: PaymentActor | null;
    voidedBy?: PaymentActor | null;
  }
): WaiverSummary {
  return {
    unitId: item.unitId,
    clientUnitId: item.clientUnitId,
    caseUnitId: item.caseUnitId,
    amount: item.amount,
    reason: item.reason,
    status: item.status,
    approvedAt: item.approvedAt ? item.approvedAt.toISOString() : null,
    voidedAt: item.voidedAt ? item.voidedAt.toISOString() : null,
    voidReason: item.voidReason,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    createdBy: actors?.createdBy ?? null,
    approvedBy: actors?.approvedBy ?? null,
    voidedBy: actors?.voidedBy ?? null,
  };
}
