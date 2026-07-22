"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import type { PublicUser } from "@/lib/auth/session";
import { canBookForAnyAdvocate } from "@/lib/appointments/booking-rules";
import {
  bookingDefaults,
  rangesFromWorkAndBreak,
} from "@/config/company/booking";
import {
  BLOCK_KIND_OPTIONS,
} from "@/lib/validations/availability.schema";
import { DatePicker } from "@/shared/components/forms/date-picker";
import { formatIstTime, istDateKey, istDisplayDate } from "@/lib/utils/ist";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { cn } from "@/lib/utils/cn";

type AdvocateOption = { unitId: string; name: string; mobile: string };

type HoursDay = {
  weekday: number;
  ranges: { startTime: string; endTime: string }[];
};

type TimeBlock = {
  unitId: string;
  userUnitId: string;
  startsAt: string;
  endsAt: string;
  kind: string;
  reason: string | null;
};

const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 0, label: "Sunday", short: "Sun" },
];

function inferSchedule(days: HoursDay[]): {
  openDays: Set<number>;
  workStart: string;
  workEnd: string;
  breakStart: string;
  breakEnd: string;
  hasBreak: boolean;
} {
  const openDays = new Set<number>();
  let workStart = bookingDefaults.workStart;
  let workEnd = bookingDefaults.workEnd;
  let breakStart = bookingDefaults.breakStart;
  let breakEnd = bookingDefaults.breakEnd;
  let hasBreak = true;

  const withRanges = days.filter((d) => d.ranges.length > 0);
  if (withRanges.length === 0) {
    return {
      openDays: new Set(bookingDefaults.defaultOpenWeekdays),
      workStart,
      workEnd,
      breakStart,
      breakEnd,
      hasBreak: true,
    };
  }

  for (const d of withRanges) openDays.add(d.weekday);

  const starts = withRanges.flatMap((d) => d.ranges.map((r) => r.startTime));
  const ends = withRanges.flatMap((d) => d.ranges.map((r) => r.endTime));
  workStart = starts.sort()[0] ?? workStart;
  workEnd = ends.sort().at(-1) ?? workEnd;

  const twoRangeDays = withRanges.filter((d) => d.ranges.length >= 2);
  if (twoRangeDays.length > 0) {
    const sample = [...twoRangeDays[0]!.ranges].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    breakStart = sample[0]!.endTime;
    breakEnd = sample[1]!.startTime;
    hasBreak = breakStart < breakEnd;
  } else {
    hasBreak = false;
    breakStart = bookingDefaults.breakStart;
    breakEnd = bookingDefaults.breakEnd;
  }

  return { openDays, workStart, workEnd, breakStart, breakEnd, hasBreak };
}

function emptyBlockForm() {
  const today = istDateKey();
  return {
    date: today,
    startTime: "13:00",
    endTime: "14:00",
    kind: "break" as string,
    reason: "",
  };
}

export function AvailabilityPage({ user }: { user: PublicUser }) {
  const canEdit = user.permissions.includes("appointments.edit");
  const bookAny = canBookForAnyAdvocate(user.roles);

  const [advocates, setAdvocates] = useState<AdvocateOption[]>([]);
  const [targetUnitId, setTargetUnitId] = useState(user.unitId);
  const [usingDefaults, setUsingDefaults] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingHours, setSavingHours] = useState(false);

  const [openDays, setOpenDays] = useState<Set<number>>(
    () => new Set(bookingDefaults.defaultOpenWeekdays)
  );
  const [workStart, setWorkStart] = useState(bookingDefaults.workStart);
  const [workEnd, setWorkEnd] = useState(bookingDefaults.workEnd);
  const [hasBreak, setHasBreak] = useState(true);
  const [breakStart, setBreakStart] = useState(bookingDefaults.breakStart);
  const [breakEnd, setBreakEnd] = useState(bookingDefaults.breakEnd);

  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [blockForm, setBlockForm] = useState(emptyBlockForm);
  const [blockBusy, setBlockBusy] = useState(false);

  const targetLabel = useMemo(() => {
    if (targetUnitId === user.unitId) return "Your schedule";
    const a = advocates.find((x) => x.unitId === targetUnitId);
    return a ? a.name || a.unitId : targetUnitId;
  }, [advocates, targetUnitId, user.unitId]);

  const loadHours = useCallback(async (unitId: string) => {
    const q = unitId !== user.unitId ? `?userUnitId=${encodeURIComponent(unitId)}` : "";
    const { ok, data } = await apiFetch<{
      usingDefaults: boolean;
      days: HoursDay[];
    }>(`/api/v1/advocates/availability/hours${q}`);
    if (!ok || !data || typeof data !== "object") {
      toast.error("Could not load working hours");
      return;
    }
    const body = data as { usingDefaults: boolean; days: HoursDay[] };
    setUsingDefaults(Boolean(body.usingDefaults));
    const inferred = inferSchedule(body.days ?? []);
    setOpenDays(inferred.openDays);
    setWorkStart(inferred.workStart);
    setWorkEnd(inferred.workEnd);
    setHasBreak(inferred.hasBreak);
    setBreakStart(inferred.breakStart);
    setBreakEnd(inferred.breakEnd);
  }, [user.unitId]);

  const loadBlocks = useCallback(async (unitId: string) => {
    const params = new URLSearchParams({ pageSize: "50" });
    if (unitId !== user.unitId) params.set("userUnitId", unitId);
    const { ok, data } = await apiFetch<{ data: TimeBlock[] }>(
      `/api/v1/advocates/availability/blocks?${params.toString()}`
    );
    if (!ok || !data || typeof data !== "object") {
      setBlocks([]);
      return;
    }
    setBlocks(Array.isArray((data as { data: TimeBlock[] }).data)
      ? (data as { data: TimeBlock[] }).data
      : []);
  }, [user.unitId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadHours(targetUnitId), loadBlocks(targetUnitId)]);
    setLoading(false);
  }, [loadBlocks, loadHours, targetUnitId]);

  useEffect(() => {
    if (!bookAny) return;
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch<{ data: AdvocateOption[] }>(
        "/api/v1/advocates?pageSize=100"
      );
      if (cancelled || !ok || !data || typeof data !== "object") return;
      const list = Array.isArray((data as { data: AdvocateOption[] }).data)
        ? (data as { data: AdvocateOption[] }).data
        : [];
      setAdvocates(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookAny]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await refresh();
    })();
  }, [refresh]);

  function toggleDay(weekday: number) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(weekday)) next.delete(weekday);
      else next.add(weekday);
      return next;
    });
  }

  async function saveHours() {
    if (!canEdit) return;
    if (workStart >= workEnd) {
      toast.error("Work end must be after work start");
      return;
    }
    if (hasBreak) {
      if (breakStart >= breakEnd) {
        toast.error("Break end must be after break start");
        return;
      }
      if (breakStart <= workStart || breakEnd >= workEnd) {
        toast.error("Break must fall inside working hours");
        return;
      }
    }

    const ranges = rangesFromWorkAndBreak({
      workStart,
      workEnd,
      breakStart: hasBreak ? breakStart : undefined,
      breakEnd: hasBreak ? breakEnd : undefined,
    });

    const days = WEEKDAYS.map(({ value }) => ({
      weekday: value,
      ranges: openDays.has(value) ? ranges : [],
    }));

    setSavingHours(true);
    const { ok, data } = await apiFetch("/api/v1/advocates/availability/hours", {
      method: "PUT",
      json: {
        userUnitId: targetUnitId === user.unitId ? undefined : targetUnitId,
        days,
      },
    });
    setSavingHours(false);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to save hours")
      );
      return;
    }
    toast.success("Working days and hours saved");
    setUsingDefaults(false);
    await loadHours(targetUnitId);
  }

  function openAddBlock() {
    setEditingBlock(null);
    setBlockForm(emptyBlockForm());
    setBlockDialogOpen(true);
  }

  function openEditBlock(block: TimeBlock) {
    const start = new Date(block.startsAt);
    const end = new Date(block.endsAt);
    setEditingBlock(block);
    setBlockForm({
      date: istDateKey(start),
      startTime: formatHm(start),
      endTime: formatHm(end),
      kind: block.kind || "break",
      reason: block.reason ?? "",
    });
    setBlockDialogOpen(true);
  }

  async function saveBlock() {
    if (!canEdit) return;
    if (!blockForm.date || !blockForm.startTime || !blockForm.endTime) {
      toast.error("Date and times are required");
      return;
    }
    if (blockForm.startTime >= blockForm.endTime) {
      toast.error("End time must be after start");
      return;
    }

    const startsAt = `${blockForm.date}T${blockForm.startTime}:00+05:30`;
    const endsAt = `${blockForm.date}T${blockForm.endTime}:00+05:30`;

    setBlockBusy(true);
    if (editingBlock) {
      const { ok, data } = await apiFetch(
        `/api/v1/advocates/availability/blocks/${editingBlock.unitId}`,
        {
          method: "PATCH",
          json: {
            startsAt,
            endsAt,
            kind: blockForm.kind,
            reason: blockForm.reason || null,
          },
        }
      );
      setBlockBusy(false);
      if (!ok) {
        toast.error(
          getErrorMessage(data as Record<string, unknown>, "Failed to update break")
        );
        return;
      }
      toast.success("Break updated");
    } else {
      const { ok, data } = await apiFetch("/api/v1/advocates/availability/blocks", {
        method: "POST",
        json: {
          userUnitId: targetUnitId === user.unitId ? undefined : targetUnitId,
          startsAt,
          endsAt,
          kind: blockForm.kind,
          reason: blockForm.reason || undefined,
        },
      });
      setBlockBusy(false);
      if (!ok) {
        toast.error(
          getErrorMessage(data as Record<string, unknown>, "Failed to add break")
        );
        return;
      }
      toast.success("Break added");
    }
    setBlockDialogOpen(false);
    await loadBlocks(targetUnitId);
  }

  async function deleteBlock(unitId: string) {
    if (!canEdit) return;
    const { ok, data } = await apiFetch(
      `/api/v1/advocates/availability/blocks/${unitId}`,
      { method: "DELETE" }
    );
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to remove break")
      );
      return;
    }
    toast.success("Break removed");
    await loadBlocks(targetUnitId);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Availability"
        description="Set which days you work, your hours, a shared break for every day, and extra day-by-day breaks. Booking only offers free slots."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/hrms">Leave (HRMS)</Link>
          </Button>
        }
      />

      {bookAny ? (
        <div className="max-w-sm space-y-2">
          <Label>Advocate</Label>
          <Select value={targetUnitId} onValueChange={setTargetUnitId}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select advocate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={user.unitId}>
                Yourself ({user.unitId})
              </SelectItem>
              {advocates
                .filter((a) => a.unitId !== user.unitId)
                .map((a) => (
                  <SelectItem key={a.unitId} value={a.unitId}>
                    {a.name} · {a.unitId}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <section className="space-y-4 rounded-xl border border-border/80 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-navy">
              Working days & hours
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {targetLabel}
              {usingDefaults ? (
                <span className="ml-2 inline-flex">
                  <Badge variant="muted">Using office defaults</Badge>
                </span>
              ) : null}
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              onClick={() => void saveHours()}
              disabled={savingHours || loading}
            >
              {savingHours ? "Saving…" : "Save hours"}
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div>
              <Label className="mb-2 block">Days available</Label>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {WEEKDAYS.map((d) => {
                  const checked = openDays.has(d.value);
                  return (
                    <label
                      key={d.value}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                        checked
                          ? "border-navy/40 bg-navy/5 text-navy"
                          : "border-border bg-white text-muted-foreground"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!canEdit}
                        onCheckedChange={() => toggleDay(d.value)}
                      />
                      <span className="font-medium">
                        <span className="sm:hidden">{d.short}</span>
                        <span className="hidden sm:inline">{d.label}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="workStart">Work start (all days)</Label>
                <Input
                  id="workStart"
                  type="time"
                  value={workStart}
                  disabled={!canEdit}
                  onChange={(e) => setWorkStart(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workEnd">Work end (all days)</Label>
                <Input
                  id="workEnd"
                  type="time"
                  value={workEnd}
                  disabled={!canEdit}
                  onChange={(e) => setWorkEnd(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-border/90 bg-muted/20 p-3 sm:p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-navy">
                <Checkbox
                  checked={hasBreak}
                  disabled={!canEdit}
                  onCheckedChange={(v) => setHasBreak(v === true)}
                />
                Shared break every working day
              </label>
              <p className="text-xs text-muted-foreground">
                Same lunch / break on every checked day. Change it once — it
                applies to all. For a one-off break on a single day, add it
                below.
              </p>
              {hasBreak ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="breakStart">Break start</Label>
                    <Input
                      id="breakStart"
                      type="time"
                      value={breakStart}
                      disabled={!canEdit}
                      onChange={(e) => setBreakStart(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="breakEnd">Break end</Label>
                    <Input
                      id="breakEnd"
                      type="time"
                      value={breakEnd}
                      disabled={!canEdit}
                      onChange={(e) => setBreakEnd(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-border/80 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-navy">
              Extra breaks (day by day)
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Court, personal time, or an extra break on a specific date. Add,
              edit, or remove anytime.
            </p>
          </div>
          {canEdit ? (
            <Button type="button" variant="outline" onClick={openAddBlock}>
              Add break
            </Button>
          ) : null}
        </div>

        {blocks.length === 0 ? (
          <EmptyState
            title="No extra breaks"
            description="Your shared daily break (if enabled) is enough. Add a day-specific block when needed."
          />
        ) : (
          <Table containerClassName="rounded-lg">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Note</TableHead>
                {canEdit ? <TableHead className="w-[1%] whitespace-nowrap" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.map((b) => {
                const start = new Date(b.startsAt);
                const end = new Date(b.endsAt);
                const kindLabel =
                  BLOCK_KIND_OPTIONS.find((k) => k.value === b.kind)?.label ??
                  b.kind;
                return (
                  <TableRow key={b.unitId}>
                    <TableCell className="whitespace-nowrap">
                      {istDisplayDate(start)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatIstTime(start)} – {formatIstTime(end)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{kindLabel}</Badge>
                      {b.reason ? (
                        <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground sm:hidden">
                          {b.reason}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden max-w-50 truncate text-muted-foreground sm:table-cell">
                      {b.reason || "—"}
                    </TableCell>
                    {canEdit ? (
                      <TableCell>
                        <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditBlock(b)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => void deleteBlock(b.unitId)}
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBlock ? "Edit break" : "Add break"}
            </DialogTitle>
            <DialogDescription>
              Blocks this person from being booked for that date and time.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <DatePicker
                value={blockForm.date}
                onChange={(date) => setBlockForm((f) => ({ ...f, date }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blockStart">Start</Label>
                <Input
                  id="blockStart"
                  type="time"
                  value={blockForm.startTime}
                  onChange={(e) =>
                    setBlockForm((f) => ({ ...f, startTime: e.target.value }))
                  }
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blockEnd">End</Label>
                <Input
                  id="blockEnd"
                  type="time"
                  value={blockForm.endTime}
                  onChange={(e) =>
                    setBlockForm((f) => ({ ...f, endTime: e.target.value }))
                  }
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={blockForm.kind}
                onValueChange={(kind) => setBlockForm((f) => ({ ...f, kind }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_KIND_OPTIONS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="blockReason">Note (optional)</Label>
              <Input
                id="blockReason"
                value={blockForm.reason}
                onChange={(e) =>
                  setBlockForm((f) => ({ ...f, reason: e.target.value }))
                }
                placeholder="e.g. Court — Sessions"
                className="h-10"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBlockDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={blockBusy}
              onClick={() => void saveBlock()}
            >
              {blockBusy ? "Saving…" : editingBlock ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** HH:mm in IST from a Date. */
function formatHm(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}
