"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import type { FeeRollup } from "@/features/accounts/server/fee-rollup";
import { rupee } from "@/features/accounts/components/accounts-page-helpers";

export function ApplyWaiverDialog({
  open,
  onOpenChange,
  caseUnitId,
  outstanding,
  pendingWaived = 0,
  requiresApproval,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseUnitId: string;
  outstanding: number | null;
  pendingWaived?: number;
  /** Sub admin requests; admin applies immediately. */
  requiresApproval: boolean;
  onSaved: (fee: FeeRollup) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const available =
    outstanding != null
      ? Math.max(0, outstanding - (pendingWaived || 0))
      : null;

  useEffect(() => {
    if (!open) return;
    void (async () => {
      await Promise.resolve();
      setAmount(available != null && available > 0 ? String(available) : "");
      setReason("");
      setError("");
    })();
  }, [open, available]);

  async function handleSubmit() {
    setError("");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid waiver amount");
      return;
    }
    if (available != null && amt > available + 1e-9) {
      setError(`Cannot exceed available balance (${rupee(available)})`);
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }

    setBusy(true);
    const { ok, data } = await apiFetch<{ fee: FeeRollup }>(
      "/api/accounts/waivers",
      {
        method: "POST",
        json: {
          caseUnitId,
          amount: amt,
          reason: reason.trim(),
        },
      }
    );
    setBusy(false);
    if (!ok) {
      setError(
        getErrorMessage(
          data as Record<string, unknown>,
          requiresApproval
            ? "Failed to submit waiver request"
            : "Failed to apply waiver"
        )
      );
      return;
    }
    const body = data as unknown as { fee: FeeRollup };
    toast.success(
      requiresApproval
        ? "Waiver submitted — awaiting admin approval"
        : "Waiver applied"
    );
    onSaved(body.fee);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {requiresApproval ? "Request fee waiver" : "Apply fee waiver"}
          </DialogTitle>
          <DialogDescription>
            {requiresApproval
              ? "Submit a write-off for admin approval. It will not reduce the balance until approved."
              : "Write off part of the remaining balance. This is not cash collected."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {outstanding != null ? (
            <p className="text-sm text-muted-foreground">
              Remaining on {caseUnitId}:{" "}
              <span className="font-medium text-navy">{rupee(outstanding)}</span>
              {pendingWaived > 0 ? (
                <>
                  {" "}
                  · Pending requests:{" "}
                  <span className="font-medium text-navy">
                    {rupee(pendingWaived)}
                  </span>
                </>
              ) : null}
              {available != null ? (
                <>
                  {" "}
                  · Available:{" "}
                  <span className="font-medium text-navy">{rupee(available)}</span>
                </>
              ) : null}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="wvr-amount">Waiver amount (₹)</Label>
            <Input
              id="wvr-amount"
              type="number"
              min={0}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wvr-reason">Reason</Label>
            <Textarea
              id="wvr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. hardship concession"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {busy
              ? requiresApproval
                ? "Submitting…"
                : "Applying…"
              : requiresApproval
                ? "Submit for approval"
                : "Apply waiver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
