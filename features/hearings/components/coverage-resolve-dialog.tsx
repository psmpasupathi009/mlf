"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import { AdvocatePicker } from "@/features/employees/components/advocate-picker";
import { DatePicker } from "@/shared/components/forms/date-picker";
import { displayMobile } from "@/lib/auth/mobile";
import { Badge } from "@/components/ui/badge";

export type CoverageItemSummary = {
  unitId: string;
  hearingUnitId: string;
  caseUnitId: string;
  originalAdvocateMobile: string;
  hearingDate: string;
  hearingDateLabel: string;
  reason: string;
  reasonNote: string | null;
  status: string;
  suggestedMobiles: string[];
  coveringMobile: string | null;
  notes: string | null;
};

type Action =
  | "cover"
  | "cover_batch"
  | "reassign_permanent"
  | "adjourn"
  | "dismiss";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CoverageItemSummary | null;
  onResolved: () => void;
};

export function CoverageResolveDialog({
  open,
  onOpenChange,
  item,
  onResolved,
}: Props) {
  const [action, setAction] = useState<Action>("cover");
  const [toMobile, setToMobile] = useState("");
  const [toLabel, setToLabel] = useState<string | null>(null);
  const [nextHearingDate, setNextHearingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    queueMicrotask(() => {
      setAction("cover");
      setToMobile("");
      setToLabel(null);
      setNextHearingDate("");
      setNotes("");
      setError("");
    });
  }, [open, item]);

  async function submit() {
    if (!item) return;
    setError("");
    setBusy(true);

    let json: Record<string, unknown> = { action };
    if (
      action === "cover" ||
      action === "cover_batch" ||
      action === "reassign_permanent"
    ) {
      if (toMobile.replace(/\D/g, "").length < 10) {
        setBusy(false);
        setError("Select a covering advocate");
        return;
      }
      json = { ...json, toMobile };
    } else if (action === "adjourn") {
      if (!nextHearingDate) {
        setBusy(false);
        setError("Pick the next hearing date");
        return;
      }
      json = {
        ...json,
        nextHearingDate,
        notes: notes || undefined,
        toMobile: toMobile || undefined,
      };
    } else {
      json = { ...json, notes: notes || undefined };
    }

    const { ok, data } = await apiFetch(
      `/api/hearings/coverage/${item.unitId}/resolve`,
      { method: "POST", json }
    );
    setBusy(false);
    if (!ok) {
      setError(getErrorMessage(data as Record<string, unknown>, "Resolve failed"));
      return;
    }
    toast.success("Coverage updated");
    onResolved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="p-0">
        <DialogHeader className="shrink-0 border-b border-border/80 px-4 py-3 pr-11 sm:px-5">
          <DialogTitle>Resolve coverage</DialogTitle>
          <DialogDescription>
            {item
              ? `${item.caseUnitId} · ${item.hearingDateLabel} · ${item.reason}`
              : "Assign cover or adjourn"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {item?.suggestedMobiles?.length ? (
            <div className="flex flex-wrap gap-1.5">
              <span className="w-full text-xs text-muted-foreground">
                Suggested
              </span>
              {item.suggestedMobiles.map((m) => {
                const ten = displayMobile(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className="rounded-md"
                    onClick={() => {
                      setToMobile(ten);
                      setToLabel(`Advocate · ${ten}`);
                    }}
                  >
                    <Badge variant="outline">{ten}</Badge>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Action</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["cover", "Cover this hearing"],
                  ["cover_batch", "Cover same day + court"],
                  ["reassign_permanent", "Permanent reassign"],
                  ["adjourn", "Adjourn"],
                  ["dismiss", "Dismiss"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={action === value ? "default" : "outline"}
                  onClick={() => setAction(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {action !== "dismiss" ? (
            <div className="grid gap-2">
              <Label>
                {action === "adjourn"
                  ? "Covering advocate (optional)"
                  : "Covering / new advocate"}
              </Label>
              <AdvocatePicker
                value={toMobile || null}
                selectedLabel={toLabel}
                onChange={(a) => {
                  if (!a) {
                    setToMobile("");
                    setToLabel(null);
                    return;
                  }
                  const m = displayMobile(a.mobile);
                  setToMobile(m);
                  setToLabel(
                    `${a.displayName || a.name || "Advocate"} · ${m}`
                  );
                }}
                valueBy="mobile"
                clearable
              />
              <Input
                value={toMobile}
                onChange={(e) => {
                  setToMobile(e.target.value);
                  setToLabel(null);
                }}
                placeholder="Or type 10-digit mobile"
                inputMode="numeric"
              />
            </div>
          ) : null}

          {action === "adjourn" ? (
            <div className="grid gap-2">
              <Label>Next hearing date</Label>
              <DatePicker value={nextHearingDate} onChange={setNextHearingDate} />
            </div>
          ) : null}

          {action === "adjourn" || action === "dismiss" ? (
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional"
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t border-border/80 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
