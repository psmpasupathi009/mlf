"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import {
  CASE_PIPELINE_STEPS,
  CASE_STATUS_LABEL,
  canTransitionStatus,
  normalizeCaseStatus,
  type CasePipelineStatus,
} from "@/config/company/case-pipeline";
import type { CaseSummary } from "@/features/cases/server/serialize";

type Props = {
  caseItem: CaseSummary;
  canEdit: boolean;
  /** Outstanding fee from accounts rollup; soft-warn on engaged → pre_filing. */
  feeOutstanding?: number | null;
  onUpdated: (next: CaseSummary) => void;
};

export function CasePipelineStrip({
  caseItem,
  canEdit,
  feeOutstanding,
  onUpdated,
}: Props) {
  const [busy, setBusy] = useState(false);
  const current = normalizeCaseStatus(caseItem.status);
  const currentIdx = CASE_PIPELINE_STEPS.indexOf(current);

  async function moveTo(next: CasePipelineStatus) {
    if (!canEdit || busy || next === current) return;
    if (!canTransitionStatus(current, next)) {
      toast.error(
        `Cannot move from ${CASE_STATUS_LABEL[current]} to ${CASE_STATUS_LABEL[next]}`
      );
      return;
    }

    if (
      current === "engaged" &&
      next === "pre_filing" &&
      caseItem.agreedFee != null &&
      caseItem.agreedFee > 0 &&
      feeOutstanding != null &&
      feeOutstanding > 0
    ) {
      if (
        !window.confirm(
          "Fee not fully collected — continue anyway?"
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        `Change status to “${CASE_STATUS_LABEL[next]}”?`
      )
    ) {
      return;
    }

    setBusy(true);
    const { ok, data } = await apiFetch<{ case: CaseSummary }>(
      `/api/v1/cases/${caseItem.unitId}/status`,
      { method: "PATCH", json: { status: next } }
    );
    setBusy(false);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to update status")
      );
      return;
    }
    const body = data as unknown as { case: CaseSummary };
    onUpdated(body.case);
    toast.success(`Status → ${CASE_STATUS_LABEL[next]}`);
  }

  return (
    <div className="overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
      <ol className="flex min-w-max items-stretch gap-1.5">
        {CASE_PIPELINE_STEPS.map((step, idx) => {
          const isCurrent = step === current;
          const isPast = currentIdx >= 0 && idx < currentIdx;
          const allowed = canEdit && canTransitionStatus(current, step);
          return (
            <li key={step}>
              <button
                type="button"
                disabled={!canEdit || busy || isCurrent || !allowed}
                onClick={() => void moveTo(step)}
                title={CASE_STATUS_LABEL[step]}
                className={cn(
                  "h-full min-w-[4.5rem] rounded-lg border px-2.5 py-2 text-left transition-colors sm:min-w-[5.25rem]",
                  isCurrent
                    ? "border-brand bg-brand text-brand-foreground shadow-sm"
                    : isPast
                      ? "border-border/60 bg-muted/70 text-navy"
                      : "border-border/80 bg-card text-muted-foreground",
                  canEdit && allowed && !isCurrent
                    ? "hover:border-brand/50 hover:text-navy"
                    : "",
                  (!canEdit || !allowed) && !isCurrent
                    ? "cursor-not-allowed opacity-60"
                    : ""
                )}
              >
                <span className="block text-[10px] font-medium uppercase tracking-wide opacity-70">
                  {idx + 1}
                </span>
                <span className="mt-0.5 block text-xs font-semibold leading-tight">
                  {CASE_STATUS_LABEL[step]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
