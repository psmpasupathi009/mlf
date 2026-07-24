"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ClientPicker } from "@/features/clients/components/client-picker";
import { DatePicker } from "@/shared/components/forms/date-picker";

export function PaymentFormDialog({
  open,
  onOpenChange,
  defaultClientUnitId,
  defaultCaseUnitId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientUnitId?: string | null;
  defaultCaseUnitId?: string | null;
  onSaved: () => void;
}) {
  const [client, setClient] = useState<{ unitId: string; name: string } | null>(null);
  const [caseUnitId, setCaseUnitId] = useState("");
  const [type, setType] = useState("advance");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("pending");
  const [paidOn, setPaidOn] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    void (async () => {
      await Promise.resolve();
      setClient(defaultClientUnitId ? { unitId: defaultClientUnitId, name: defaultClientUnitId } : null);
      setCaseUnitId(defaultCaseUnitId ?? "");
      setType("advance");
      setAmount("");
      setStatus("pending");
      setPaidOn("");
      setNotes("");
      setError("");
    })();
  }, [open, defaultClientUnitId, defaultCaseUnitId]);

  async function handleSubmit() {
    setError("");
    if (!client) {
      setError("Select a client");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setBusy(true);
    const { ok, data } = await apiFetch("/api/v1/accounts", {
      method: "POST",
      json: {
        clientUnitId: client.unitId,
        caseUnitId: caseUnitId || undefined,
        type,
        amount: amt,
        status,
        paidOn: paidOn || undefined,
        notes: notes || undefined,
      },
    });
    setBusy(false);
    if (!ok) {
      setError(getErrorMessage(data as Record<string, unknown>, "Failed to save entry"));
      return;
    }
    toast.success("Cash entry recorded");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Record cash entry</DialogTitle>
          <DialogDescription>Advance, partial or full payment from a client.</DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          <ClientPicker value={client} onChange={setClient} />

          <div className="grid gap-2">
            <Label htmlFor="pay-case">Case ID (optional)</Label>
            <Input id="pay-case" value={caseUnitId} onChange={(e) => setCaseUnitId(e.target.value)} placeholder="CSE-00001" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-200">
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-amount">Amount (₹)</Label>
              <Input id="pay-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-200">
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Paid on</Label>
            <DatePicker value={paidOn} onChange={setPaidOn} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? "Saving…" : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
