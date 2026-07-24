"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { LEAVE_REASON_OPTIONS } from "@/config/company/form-options";
import { SelectOrOther } from "@/shared/components/forms/select-or-other";
import { DatePicker } from "@/shared/components/forms/date-picker";

type LeaveApplyDialogProps = {
  open: boolean;
  /** Client-only open state — name ends with Action for Next.js TS plugin. */
  onOpenChangeAction: (open: boolean) => void;
  /** Client-only refresh callback after submit. */
  onSavedAction: () => void;
};

export function LeaveApplyDialog({
  open,
  onOpenChangeAction,
  onSavedAction,
}: LeaveApplyDialogProps) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
  }, [open]);

  function handleFromChange(next: string) {
    setFromDate(next);
    if (!toDate || toDate < next) setToDate(next);
  }

  async function handleSubmit() {
    setError("");
    if (!fromDate || !toDate) {
      setError("Select both dates");
      return;
    }
    if (fromDate > toDate) {
      setError("From date must be on or before to date");
      return;
    }
    setBusy(true);
    const { ok, data } = await apiFetch("/api/v1/hrms/leave", {
      method: "POST",
      json: { fromDate, toDate, reason: reason || undefined },
    });
    setBusy(false);
    if (!ok) {
      setError(
        getErrorMessage(
          data as Record<string, unknown>,
          "Failed to apply for leave"
        )
      );
      return;
    }
    toast.success("Leave request submitted — waiting for approval");
    setFromDate("");
    setToDate("");
    setReason("");
    onSavedAction();
    onOpenChangeAction(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            Submit dates for office approval. Pending or approved leave that
            overlaps these dates is blocked. Approved leave shows as On leave on
            the team board — it is not the same as Checked out.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>From</Label>
            <DatePicker value={fromDate} onChange={handleFromChange} />
          </div>
          <div className="grid gap-2">
            <Label>To</Label>
            <DatePicker value={toDate} onChange={setToDate} />
          </div>
          <div className="grid gap-2">
            <Label>Reason</Label>
            <SelectOrOther
              value={reason}
              onChange={setReason}
              options={LEAVE_REASON_OPTIONS}
              placeholder="Select reason"
              className="h-10"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChangeAction(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
