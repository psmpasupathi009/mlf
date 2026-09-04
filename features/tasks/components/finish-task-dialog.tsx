"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { FormError } from "@/shared/components/feedback/form-error";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import type { OfficeTaskSummary } from "@/features/tasks/server/serialize";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: OfficeTaskSummary | null;
  onSaved: () => void;
};

export function FinishTaskDialog({
  open,
  onOpenChange,
  task,
  onSaved,
}: Props) {
  const [finishNote, setFinishNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFinishNote("");
      setError("");
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!task) return;
    const note = finishNote.trim();
    if (!note) {
      setError("Add a short note before marking done");
      return;
    }
    setError("");
    setBusy(true);
    const res = await apiFetch(`/api/tasks/${task.unitId}`, {
      method: "PATCH",
      json: {
        status: "done",
        finishNote: note,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        getErrorMessage(
          res.data as Record<string, unknown>,
          "Failed to mark task done"
        )
      );
      return;
    }
    toast.success("Marked done");
    onSaved();
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Respond & mark done</DialogTitle>
          <DialogDescription>
            Add a short note for “{task?.title}”, then mark it done.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Your response note</Label>
            <Textarea
              value={finishNote}
              onChange={(e) => setFinishNote(e.target.value)}
              rows={4}
              placeholder="What was completed / handed over?"
              autoFocus
            />
          </div>
          <FormError>{error}</FormError>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || !finishNote.trim()}
          >
            {busy ? "Saving…" : "Mark done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PendingGateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Why the gate opened — shown in the title. */
  reason: "logout" | "checkout";
  /** Called after every pending task has a finish note / is done. */
  onAllDone: () => void;
};

type PendingResponse = {
  tasks: OfficeTaskSummary[];
  count: number;
};

/** Fetch today's open tasks that still need an evening response. */
export async function fetchPendingTaskResponses(): Promise<OfficeTaskSummary[]> {
  const { ok, data } = await apiFetch<PendingResponse>(
    "/api/tasks/pending-response"
  );
  if (!ok) return [];
  const body = data as unknown as PendingResponse;
  return body.tasks ?? [];
}

/**
 * Lists today's unanswered tasks and walks through finish notes.
 * Used before logout and HRMS check-out.
 */
export function PendingTasksGateDialog({
  open,
  onOpenChange,
  reason,
  onAllDone,
}: PendingGateProps) {
  const [tasks, setTasks] = useState<OfficeTaskSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [finishNote, setFinishNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onAllDoneRef = useRef(onAllDone);
  const onOpenChangeRef = useRef(onOpenChange);
  onAllDoneRef.current = onAllDone;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setIndex(0);
    setFinishNote("");
    setError("");
    void (async () => {
      const list = await fetchPendingTaskResponses();
      if (cancelled) return;
      setTasks(list);
      setLoading(false);
      if (list.length === 0) {
        onAllDoneRef.current();
        onOpenChangeRef.current(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const current = tasks[index] ?? null;
  const remaining = tasks.length - index;

  async function submitCurrent() {
    if (!current) return;
    const note = finishNote.trim();
    if (!note) {
      setError("Add a short note before continuing");
      return;
    }
    setError("");
    setBusy(true);
    const res = await apiFetch(`/api/tasks/${current.unitId}`, {
      method: "PATCH",
      json: { status: "done", finishNote: note },
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        getErrorMessage(
          res.data as Record<string, unknown>,
          "Failed to save response"
        )
      );
      return;
    }
    toast.success(`Done: ${current.title}`);
    const nextIndex = index + 1;
    if (nextIndex >= tasks.length) {
      setFinishNote("");
      onAllDone();
      onOpenChange(false);
      return;
    }
    setIndex(nextIndex);
    setFinishNote("");
  }

  const title =
    reason === "logout"
      ? "Answer tasks before logout"
      : "Answer tasks before check-out";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {loading
              ? "Checking your open tasks for today…"
              : remaining > 0
                ? `${remaining} open task${remaining === 1 ? "" : "s"} need a short response note.`
                : "All caught up."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {current ? (
            <>
              <div>
                <p className="text-sm font-semibold text-navy">{current.title}</p>
                {current.notes ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {current.notes}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label>Your response note</Label>
                <Textarea
                  value={finishNote}
                  onChange={(e) => setFinishNote(e.target.value)}
                  rows={4}
                  placeholder="What was completed / handed over?"
                  autoFocus
                />
              </div>
              <FormError>{error}</FormError>
            </>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || loading || !current || !finishNote.trim()}
            onClick={() => void submitCurrent()}
          >
            {busy
              ? "Saving…"
              : remaining > 1
                ? "Save & next"
                : reason === "logout"
                  ? "Save & log out"
                  : "Save & check out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
