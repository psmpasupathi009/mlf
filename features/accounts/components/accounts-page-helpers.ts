import type { PaymentSummary } from "@/features/accounts/server/serialize";
import type { PeriodPreset } from "@/features/accounts/lib/period";

export type PaymentRow = PaymentSummary & { clientName: string | null };

export type FeeSummary = {
  agreedFee: number | null;
  collected: number;
  waived: number;
  pendingWaived: number;
  outstanding: number | null;
  settlement: "none" | "partial" | "paid";
};

export type ListResponse = {
  data: PaymentRow[];
  meta: { page: number; pageSize: number; total: number };
  summary: {
    paid: number;
    pending: number;
    void: number;
    netCollected: number;
    entryCount: number;
  };
  fee: FeeSummary | null;
};

export const STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "muted"
> = {
  pending: "warning",
  paid: "success",
  void: "muted",
};

export const PERIOD_CHIPS: { id: PeriodPreset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "month", label: "This month" },
  { id: "fy", label: "This FY" },
  { id: "custom", label: "Custom range" },
];

export const STATUS_CHIPS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "pending", label: "Pending" },
  { id: "void", label: "Void" },
];

export function rupee(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function settlementBadge(
  settlement: FeeSummary["settlement"] | undefined,
  waived?: number
): { label: string; variant: "success" | "warning" | "muted" } | null {
  if (!settlement || settlement === "none") {
    return { label: "Unpaid", variant: "muted" };
  }
  if (settlement === "paid") {
    return {
      label: waived && waived > 0 ? "Paid · waived" : "Paid",
      variant: "success",
    };
  }
  return { label: "Partial", variant: "warning" };
}

export function truncate(s: string | null, n = 40) {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
