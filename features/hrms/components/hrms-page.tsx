"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
import { PersonChip } from "@/shared/components/user/person-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/shared/components/forms/date-picker";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import type { PublicUser } from "@/lib/auth/session";
import type {
  AttendanceSummary,
  LeaveSummary,
} from "@/features/hrms/server/serialize";
import type {
  PresenceBoard,
  PresencePerson,
  PresenceStatus,
} from "@/features/hrms/server/presence";
import { LeaveApplyDialog } from "@/features/hrms/components/leave-apply-dialog";
import {
  last30DateKeys,
  thisMonthDateKeys,
  type HistoryPeriod,
} from "@/features/hrms/lib/period";
import { leaveCoversDate } from "@/features/hrms/lib/status";
import { istDateKey, formatIstTime } from "@/lib/utils/ist";
import { cn } from "@/lib/utils/cn";
import { personDisplayName } from "@/shared/lib/person";

type AttendanceList = { data: AttendanceSummary[]; meta: { total: number } };
type LeaveList = { data: LeaveSummary[]; meta: { total: number } };

type DeskSection = "today" | "history" | "leave";

const LEAVE_VARIANT: Record<
  string,
  "warning" | "success" | "destructive" | "outline" | "muted"
> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "outline",
};

const PRESENCE_VARIANT: Record<
  PresenceStatus,
  "warning" | "success" | "muted" | "outline"
> = {
  absent: "warning",
  on_leave: "muted",
  in: "success",
  out: "outline",
};

const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  absent: "Absent",
  on_leave: "On leave",
  in: "Present",
  out: "Checked out",
};

const STATUS_ROW: Record<PresenceStatus, string> = {
  absent: "border-l-[3px] border-l-amber-400/90",
  on_leave: "border-l-[3px] border-l-muted-foreground/40",
  in: "border-l-[3px] border-l-emerald-500/80",
  out: "border-l-[3px] border-l-border",
};

function personLabel(
  unitId: string,
  name: string | null | undefined,
  mobile?: string | null
) {
  return personDisplayName({ name, mobile, unitId });
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatIstTime(new Date(iso));
}

function formatDayLabel(dateKey: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${dateKey}T12:00:00+05:30`));
  } catch {
    return dateKey;
  }
}

function formatDayShort(dateKey: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
    }).format(new Date(`${dateKey}T12:00:00+05:30`));
  } catch {
    return dateKey;
  }
}

function leaveDays(fromDate: string, toDate: string) {
  const start = new Date(`${fromDate}T12:00:00+05:30`).getTime();
  const end = new Date(`${toDate}T12:00:00+05:30`).getTime();
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
  return days <= 1 ? "1 day" : `${days} days`;
}

function SelfStatusBadge({
  onLeave,
  record,
}: {
  onLeave: boolean;
  record: AttendanceSummary | null;
}) {
  if (onLeave) {
    return <Badge variant="muted" className="normal-case">On leave</Badge>;
  }
  if (record?.checkOutAt) {
    return <Badge variant="outline" className="normal-case">Checked out</Badge>;
  }
  if (record?.checkInAt) {
    return <Badge variant="success" className="normal-case">Present</Badge>;
  }
  return <Badge variant="warning" className="normal-case">Not in</Badge>;
}

export function HrmsPage({ user }: { user: PublicUser }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManageAttendance = user.permissions.includes("hrms.manage_attendance");
  const canApproveLeave = user.permissions.includes("hrms.approve_leave");
  const canOwnAttendance = user.permissions.includes("hrms.own_attendance");
  const canOwnLeave = user.permissions.includes("hrms.own_leave");

  const [section, setSection] = useState<DeskSection>("today");
  const [todayRecord, setTodayRecord] = useState<AttendanceSummary | null>(null);
  const [history, setHistory] = useState<AttendanceSummary[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [presence, setPresence] = useState<PresenceBoard | null>(null);
  const [myLeave, setMyLeave] = useState<LeaveSummary[]>([]);
  const [pendingLeave, setPendingLeave] = useState<LeaveSummary[]>([]);
  const [pendingLeaveTotal, setPendingLeaveTotal] = useState(0);
  const [decidedLeave, setDecidedLeave] = useState<LeaveSummary[]>([]);
  const [decidedLeaveTotal, setDecidedLeaveTotal] = useState(0);
  const [leaveInboxTab, setLeaveInboxTab] = useState<"pending" | "decided">(
    "pending"
  );
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkBusy, setCheckBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LeaveSummary | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaveSummary | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);

  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const today = istDateKey();

  const onLeaveToday = useMemo(
    () =>
      myLeave.some(
        (l) =>
          l.status === "approved" &&
          leaveCoversDate(l.fromDate, l.toDate, today)
      ),
    [myLeave, today]
  );

  const pendingLeaveToday = useMemo(
    () =>
      myLeave.some(
        (l) =>
          l.status === "pending" &&
          leaveCoversDate(l.fromDate, l.toDate, today)
      ),
    [myLeave, today]
  );

  const historyRange = useMemo(() => {
    if (historyPeriod === "month") return thisMonthDateKeys();
    if (historyPeriod === "30d") return last30DateKeys();
    if (customFrom && customTo && customFrom <= customTo) {
      return { from: customFrom, to: customTo };
    }
    return null;
  }, [historyPeriod, customFrom, customTo]);

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const tasks: Promise<void>[] = [];

      if (canOwnAttendance) {
        tasks.push(
          (async () => {
            const attRes = await apiFetch<AttendanceList>(
              `/api/v1/hrms/attendance?mine=1&from=${today}&to=${today}&pageSize=1`
            );
            if (attRes.ok) {
              const rows =
                (attRes.data as unknown as AttendanceList).data ?? [];
              setTodayRecord(rows[0] ?? null);
            } else {
              toast.error(
                getErrorMessage(
                  attRes.data as Record<string, unknown>,
                  "Failed to load attendance"
                )
              );
            }
          })()
        );
      }

      if (canOwnLeave) {
        tasks.push(
          (async () => {
            const leaveRes = await apiFetch<LeaveList>(
              "/api/v1/hrms/leave?mine=1&pageSize=50"
            );
            if (leaveRes.ok) {
              setMyLeave((leaveRes.data as unknown as LeaveList).data ?? []);
            } else {
              toast.error(
                getErrorMessage(
                  leaveRes.data as Record<string, unknown>,
                  "Failed to load leave"
                )
              );
            }
          })()
        );
      }

      if (canManageAttendance) {
        tasks.push(
          (async () => {
            const res = await apiFetch<PresenceBoard>(
              `/api/v1/hrms/presence?date=${today}`
            );
            if (res.ok) {
              setPresence(res.data as unknown as PresenceBoard);
            } else {
              toast.error(
                getErrorMessage(
                  res.data as Record<string, unknown>,
                  "Failed to load who’s in"
                )
              );
            }
          })()
        );
      }

      if (canApproveLeave) {
        tasks.push(
          (async () => {
            const [pendingRes, decidedRes] = await Promise.all([
              apiFetch<LeaveList>(
                "/api/v1/hrms/leave?status=pending&pageSize=50"
              ),
              apiFetch<LeaveList>(
                "/api/v1/hrms/leave?status=decided&pageSize=50"
              ),
            ]);
            if (pendingRes.ok) {
              const body = pendingRes.data as unknown as LeaveList;
              setPendingLeave(body.data ?? []);
              setPendingLeaveTotal(body.meta?.total ?? body.data?.length ?? 0);
            }
            if (decidedRes.ok) {
              const body = decidedRes.data as unknown as LeaveList;
              setDecidedLeave(body.data ?? []);
              setDecidedLeaveTotal(body.meta?.total ?? body.data?.length ?? 0);
            }
          })()
        );
      }

      await Promise.all(tasks);
    } finally {
      setLoading(false);
    }
  }, [
    canOwnAttendance,
    canOwnLeave,
    canManageAttendance,
    canApproveLeave,
    today,
  ]);

  const loadHistory = useCallback(async () => {
    if (!canOwnAttendance || !historyRange) return;
    setHistoryLoading(true);
    try {
      const res = await apiFetch<AttendanceList>(
        `/api/v1/hrms/attendance?mine=1&from=${historyRange.from}&to=${historyRange.to}&pageSize=50`
      );
      if (!res.ok) {
        toast.error(
          getErrorMessage(
            res.data as Record<string, unknown>,
            "Failed to load history"
          )
        );
        return;
      }
      const body = res.data as unknown as AttendanceList;
      setHistory(body.data ?? []);
      setHistoryTotal(body.meta?.total ?? 0);
    } finally {
      setHistoryLoading(false);
    }
  }, [canOwnAttendance, historyRange]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await loadCore();
    })();
  }, [loadCore]);

  useEffect(() => {
    if (section !== "history") return;
    void (async () => {
      await Promise.resolve();
      await loadHistory();
    })();
  }, [section, loadHistory]);

  useEffect(() => {
    const sectionParam = searchParams.get("section");
    if (
      sectionParam === "leave" ||
      sectionParam === "history" ||
      sectionParam === "today"
    ) {
      queueMicrotask(() => {
        setSection(sectionParam);
        const next = new URLSearchParams(searchParams.toString());
        next.delete("section");
        const qs = next.toString();
        router.replace(qs ? `/hrms?${qs}` : "/hrms", { scroll: false });
      });
    }

    const wantLeave =
      searchParams.get("leave") === "1" || searchParams.get("new") === "1";
    if (!wantLeave || !canOwnLeave) return;
    queueMicrotask(() => {
      setSection("leave");
      setApplyOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("leave");
      next.delete("new");
      next.delete("section");
      const qs = next.toString();
      router.replace(qs ? `/hrms?${qs}` : "/hrms", { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openApplyLeave() {
    setSection("leave");
    setApplyOpen(true);
  }

  function handleLeaveSaved() {
    setSection("leave");
    void loadCore();
  }

  async function submitCheckIn() {
    setCheckBusy(true);
    const { ok, data } = await apiFetch("/api/v1/hrms/attendance/check-in", {
      method: "POST",
      json: { notes: checkInNotes.trim() || undefined },
    });
    setCheckBusy(false);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to check in")
      );
      return;
    }
    toast.success("Checked in");
    setCheckInOpen(false);
    setCheckInNotes("");
    void loadCore();
  }

  async function handleCheckOut() {
    setCheckBusy(true);
    const { ok, data } = await apiFetch("/api/v1/hrms/attendance/check-out", {
      method: "POST",
      json: {},
    });
    setCheckBusy(false);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to check out")
      );
      return;
    }
    toast.success("Checked out");
    void loadCore();
  }

  async function handleCancelLeave() {
    if (!cancelTarget) return;
    setCancelBusyId(cancelTarget.unitId);
    const { ok, data } = await apiFetch(
      `/api/v1/hrms/leave/${cancelTarget.unitId}/cancel`,
      { method: "POST" }
    );
    setCancelBusyId(null);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to cancel leave")
      );
      return;
    }
    toast.success("Leave request cancelled");
    setCancelTarget(null);
    void loadCore();
  }

  async function handleApprove(unitId: string) {
    setDeciding(true);
    const { ok, data } = await apiFetch(`/api/v1/hrms/leave/${unitId}/decide`, {
      method: "POST",
      json: { decision: "approved" },
    });
    setDeciding(false);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to approve leave")
      );
      return;
    }
    toast.success("Leave approved");
    void loadCore();
  }

  async function handleRejectSubmit() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error("Enter a brief reject reason");
      return;
    }
    setDeciding(true);
    const { ok, data } = await apiFetch(
      `/api/v1/hrms/leave/${rejectTarget.unitId}/decide`,
      {
        method: "POST",
        json: { decision: "rejected", rejectReason: reason },
      }
    );
    setDeciding(false);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to reject leave")
      );
      return;
    }
    toast.success("Leave rejected");
    setRejectTarget(null);
    setRejectReason("");
    void loadCore();
  }

  const counts = presence?.counts;
  const sections: { id: DeskSection; label: string }[] = [
    { id: "today", label: "Today" },
    ...(canOwnAttendance ? [{ id: "history" as const, label: "My history" }] : []),
    ...(canOwnLeave || canApproveLeave
      ? [{ id: "leave" as const, label: "Leave" }]
      : []),
  ];

  return (
    <section className="space-y-5">
      <PageHeader
        title="HRMS"
        description="Attendance and leave for the office — check in when you arrive, check out when you leave; apply leave for days away."
        actions={
          <>
            {canOwnAttendance ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    onLeaveToday ||
                    Boolean(todayRecord?.checkInAt) ||
                    checkBusy
                  }
                  onClick={() => {
                    setCheckInNotes("");
                    setCheckInOpen(true);
                  }}
                >
                  Check in
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    !todayRecord?.checkInAt ||
                    Boolean(todayRecord?.checkOutAt) ||
                    checkBusy
                  }
                  onClick={handleCheckOut}
                >
                  Check out
                </Button>
              </>
            ) : null}
            {canOwnLeave ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openApplyLeave}
              >
                Apply leave
              </Button>
            ) : null}
          </>
        }
      />

      {/* Self + team KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm shadow-black/5 dark:shadow-md dark:shadow-black/40">
          <p className="text-xs font-medium text-muted-foreground">Your status</p>
          <div className="mt-2 flex items-center gap-2">
            <SelfStatusBadge onLeave={onLeaveToday} record={todayRecord} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {onLeaveToday
              ? "Approved leave covers today"
              : todayRecord?.checkInAt
                ? `In ${formatTime(todayRecord.checkInAt)}`
                : "Not checked in"}
            {!onLeaveToday && todayRecord?.checkOutAt
              ? ` · Out ${formatTime(todayRecord.checkOutAt)}`
              : ""}
            {pendingLeaveToday && !onLeaveToday
              ? " · Leave pending approval"
              : ""}
          </p>
        </div>
        {canManageAttendance && counts ? (
          (
            [
              { label: "Present", value: counts.present },
              { label: "Checked out", value: counts.out },
              { label: "On leave", value: counts.onLeave },
              { label: "Absent", value: counts.absent },
            ] as const
          ).map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-border/80 bg-card p-4 shadow-sm shadow-black/5 dark:shadow-md dark:shadow-black/40"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {kpi.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-navy">
                {loading ? "—" : kpi.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Today · office</p>
            </div>
          ))
        ) : null}
      </div>

      {/* Section chips */}
      <div className="flex flex-wrap gap-1.5">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              section === s.id
                ? "bg-brand text-brand-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-navy"
            )}
          >
            {s.label}
            {s.id === "leave" && canApproveLeave && pendingLeaveTotal > 0
              ? ` (${pendingLeaveTotal})`
              : ""}
          </button>
        ))}
      </div>

      {section === "today" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Your day</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              {loading ? (
                <div className="h-12 animate-pulse rounded-lg bg-muted" />
              ) : onLeaveToday ? (
                <p>
                  You are on <span className="font-medium text-navy">approved leave</span> today —
                  no check-in needed. Use Apply leave only for other dates.
                </p>
              ) : todayRecord?.checkInAt ? (
                <div className="space-y-1">
                  <p>
                    Checked in at{" "}
                    <span className="font-medium text-navy">
                      {formatTime(todayRecord.checkInAt)}
                    </span>
                    {todayRecord.checkOutAt
                      ? ` · checked out at ${formatTime(todayRecord.checkOutAt)}`
                      : " · still present — use Check out when you leave"}
                  </p>
                  {todayRecord.notes ? (
                    <p className="text-xs">Note: {todayRecord.notes}</p>
                  ) : null}
                </div>
              ) : (
                <p>
                  Not checked in yet. Use Check in when you arrive at the office.
                  {pendingLeaveToday
                    ? " You have a leave request pending for today."
                    : ""}
                </p>
              )}
            </CardContent>
          </Card>

          {canManageAttendance ? (
            <Card>
              <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Who’s in today</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Color bar: amber absent · green present · grey on leave
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="space-y-2 px-5 pb-5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-14 animate-pulse rounded-lg bg-muted"
                      />
                    ))}
                  </div>
                ) : !presence || presence.people.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No active staff yet. Add people in Employees.
                  </p>
                ) : (
                  <>
                    <div className="divide-y divide-border/70 md:hidden">
                      {presence.people.map((row) => (
                        <PresenceCard key={row.unitId} row={row} />
                      ))}
                    </div>
                    <Table containerClassName="hidden rounded-none border-0 border-t shadow-none md:block">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="min-w-48">Person</TableHead>
                          <TableHead className="hidden min-w-32 xl:table-cell">
                            Designation
                          </TableHead>
                          <TableHead className="w-34">Status</TableHead>
                          <TableHead className="w-28 text-right">
                            Check in
                          </TableHead>
                          <TableHead className="w-28 text-right">
                            Check out
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {presence.people.map((row) => (
                          <TableRow
                            key={row.unitId}
                            className={cn(STATUS_ROW[row.status])}
                          >
                            <TableCell>
                              <PersonChip
                                name={row.displayName}
                                photoUrl={row.photoUrl}
                                mobile={row.mobile}
                                unitId={row.unitId}
                                subtitle={row.mobile ? `+91 ${row.mobile}` : row.unitId}
                              />
                            </TableCell>
                            <TableCell className="hidden xl:table-cell">
                              {row.designation ? (
                                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground">
                                  {row.designation}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={PRESENCE_VARIANT[row.status]}
                                className="normal-case"
                              >
                                {PRESENCE_LABEL[row.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatTime(row.checkInAt)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatTime(row.checkOutAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {section === "history" ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>My attendance history</CardTitle>
              <p className="text-xs text-muted-foreground">
                {historyTotal
                  ? historyTotal > history.length
                    ? `Showing ${history.length} of ${historyTotal} day(s)`
                    : `${historyTotal} day(s)`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "month" as const, label: "This month" },
                  { id: "30d" as const, label: "Last 30 days" },
                  { id: "custom" as const, label: "Custom" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setHistoryPeriod(p.id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    historyPeriod === p.id
                      ? "bg-brand text-brand-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-navy"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {historyPeriod === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
                <div className="grid gap-1.5">
                  <Label>From</Label>
                  <DatePicker value={customFrom} onChange={setCustomFrom} />
                </div>
                <div className="grid gap-1.5">
                  <Label>To</Label>
                  <DatePicker value={customTo} onChange={setCustomTo} />
                </div>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {historyPeriod === "custom" && !historyRange ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">
                Pick a valid from / to range.
              </p>
            ) : historyLoading ? (
              <div className="space-y-2 px-5 pb-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No attendance in this range yet.
              </p>
            ) : (
              <>
                <div className="divide-y divide-border/70 md:hidden">
                  {history.map((row) => (
                    <div key={row.unitId} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-navy">
                            {formatDayLabel(row.date)}
                          </p>
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {formatTime(row.checkInAt)}
                            <span className="mx-1.5 text-border">→</span>
                            {formatTime(row.checkOutAt)}
                          </p>
                          {row.notes ? (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {row.notes}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          variant={
                            row.checkOutAt
                              ? "outline"
                              : row.checkInAt
                                ? "success"
                                : "warning"
                          }
                          className="shrink-0 normal-case"
                        >
                          {row.checkOutAt
                            ? "Checked out"
                            : row.checkInAt
                              ? "Present"
                              : "—"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <Table containerClassName="hidden rounded-none border-0 border-t shadow-none md:block">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-44">Date</TableHead>
                      <TableHead className="w-28 text-right">
                        Check in
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        Check out
                      </TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((row) => (
                      <TableRow key={row.unitId}>
                        <TableCell>
                          <p className="font-medium text-navy">
                            {formatDayLabel(row.date)}
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {row.date}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatTime(row.checkInAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatTime(row.checkOutAt)}
                        </TableCell>
                        <TableCell className="max-w-sm truncate text-muted-foreground">
                          {row.notes || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "leave" ? (
        <div className="space-y-4">
          {canApproveLeave ? (
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0">
                <CardTitle>Leave inbox</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      {
                        id: "pending" as const,
                        label: `Pending (${pendingLeaveTotal})`,
                      },
                      {
                        id: "decided" as const,
                        label:
                          decidedLeaveTotal > 0
                            ? `Decided (${decidedLeaveTotal})`
                            : "Decided",
                      },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setLeaveInboxTab(t.id)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        leaveInboxTab === t.id
                          ? "bg-brand text-brand-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-navy"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {leaveInboxTab === "pending" ? (
                  pendingLeave.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                      No pending requests — you’re all caught up.
                    </p>
                  ) : (
                    <LeaveTable
                      rows={pendingLeave}
                      mode="approve"
                      currentUserUnitId={user.unitId}
                      deciding={deciding}
                      onApprove={handleApprove}
                      onReject={(l) => {
                        setRejectReason("");
                        setRejectTarget(l);
                      }}
                    />
                  )
                ) : decidedLeave.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Approved and rejected leave will show here.
                  </p>
                ) : (
                  <LeaveTable rows={decidedLeave} mode="readonly" />
                )}
              </CardContent>
            </Card>
          ) : null}

          {canOwnLeave ? (
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>My leave</CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={openApplyLeave}
                >
                  Apply leave
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="space-y-2 px-5 pb-5">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-12 animate-pulse rounded-lg bg-muted"
                      />
                    ))}
                  </div>
                ) : myLeave.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No leave requests yet. Apply when you need time off.
                  </p>
                ) : (
                  <LeaveTable
                    rows={myLeave}
                    mode="mine"
                    cancelBusyId={cancelBusyId}
                    onCancel={(l) => setCancelTarget(l)}
                  />
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <LeaveApplyDialog
        open={applyOpen}
        onOpenChangeAction={setApplyOpen}
        onSavedAction={handleLeaveSaved}
      />

      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Check in</DialogTitle>
            <DialogDescription>
              Optional note for today (court visit, site work, etc.). Checked out
              later means you left for the day — use Apply leave for full days away.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <Label htmlFor="checkin-notes">Note (optional)</Label>
            <Textarea
              id="checkin-notes"
              value={checkInNotes}
              onChange={(e) => setCheckInNotes(e.target.value)}
              placeholder="e.g. At Gobichettipalayam court"
              rows={3}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCheckInOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={checkBusy}
              onClick={submitCheckIn}
            >
              {checkBusy ? "Checking in…" : "Check in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cancel leave request?</DialogTitle>
            <DialogDescription>
              {cancelTarget
                ? `${cancelTarget.fromDate} → ${cancelTarget.toDate}. You can apply again later.`
                : "Withdraw this pending request."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelTarget(null)}
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(cancelBusyId)}
              onClick={handleCancelLeave}
            >
              {cancelBusyId ? "Cancelling…" : "Cancel request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reject leave</DialogTitle>
            <DialogDescription>
              {rejectTarget
                ? `Reject leave for ${personLabel(rejectTarget.userUnitId, rejectTarget.userName)} (${rejectTarget.fromDate} → ${rejectTarget.toDate}).`
                : "Provide a reason for rejection."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this leave being rejected?"
              rows={3}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deciding}
              onClick={handleRejectSubmit}
            >
              {deciding ? "Rejecting…" : "Reject leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PresenceCard({ row }: { row: PresencePerson }) {
  return (
    <div className={cn("flex items-start gap-3 px-4 py-3", STATUS_ROW[row.status])}>
      <div className="min-w-0 flex-1">
        <PersonChip
          name={row.displayName}
          photoUrl={row.photoUrl}
          mobile={row.mobile}
          unitId={row.unitId}
          subtitle={row.designation || (row.mobile ? `+91 ${row.mobile}` : undefined)}
        />
        {row.status === "in" || row.status === "out" ? (
          <p className="mt-1.5 pl-10.5 text-xs tabular-nums text-muted-foreground">
            {formatTime(row.checkInAt)}
            <span className="mx-1.5 text-border">→</span>
            {formatTime(row.checkOutAt)}
          </p>
        ) : null}
      </div>
      <Badge
        variant={PRESENCE_VARIANT[row.status]}
        className="shrink-0 normal-case"
      >
        {PRESENCE_LABEL[row.status]}
      </Badge>
    </div>
  );
}

function LeaveTable({
  rows,
  mode,
  currentUserUnitId,
  deciding,
  cancelBusyId,
  onApprove,
  onReject,
  onCancel,
}: {
  rows: LeaveSummary[];
  mode: "mine" | "approve" | "readonly";
  currentUserUnitId?: string;
  deciding?: boolean;
  cancelBusyId?: string | null;
  onApprove?: (unitId: string) => void;
  onReject?: (row: LeaveSummary) => void;
  onCancel?: (row: LeaveSummary) => void;
}) {
  return (
    <>
      <div className="divide-y divide-border/70 md:hidden">
        {rows.map((l) => (
          <div key={l.unitId} className="space-y-2.5 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {mode !== "mine" ? (
                  <p className="truncate text-sm font-medium text-navy">
                    {personLabel(l.userUnitId, l.userName)}
                  </p>
                ) : null}
                <p
                  className={cn(
                    "text-sm font-medium text-navy",
                    mode !== "mine" && "mt-0.5 text-xs font-normal text-muted-foreground"
                  )}
                >
                  {formatDayShort(l.fromDate)}
                  {l.fromDate !== l.toDate ? ` → ${formatDayShort(l.toDate)}` : ""}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    · {leaveDays(l.fromDate, l.toDate)}
                  </span>
                </p>
                {l.reason ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {l.reason}
                  </p>
                ) : null}
                {l.status === "rejected" && l.rejectReason ? (
                  <p className="mt-1 text-xs text-destructive">{l.rejectReason}</p>
                ) : null}
              </div>
              <Badge
                variant={LEAVE_VARIANT[l.status] ?? "outline"}
                className="shrink-0 normal-case"
              >
                {l.status}
              </Badge>
            </div>
            {mode === "approve" ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={deciding || l.userUnitId === currentUserUnitId}
                  onClick={() => onApprove?.(l.unitId)}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={deciding || l.userUnitId === currentUserUnitId}
                  onClick={() => onReject?.(l)}
                >
                  Reject
                </Button>
              </div>
            ) : null}
            {mode === "mine" && l.status === "pending" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={cancelBusyId === l.unitId}
                onClick={() => onCancel?.(l)}
              >
                {cancelBusyId === l.unitId ? "Cancelling…" : "Cancel request"}
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <Table containerClassName="hidden rounded-none border-0 border-t shadow-none md:block">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {mode !== "mine" ? (
              <TableHead className="min-w-44">Employee</TableHead>
            ) : null}
            <TableHead className="min-w-48">Dates</TableHead>
            <TableHead className="hidden lg:table-cell">Reason</TableHead>
            <TableHead className="w-28">Status</TableHead>
            {mode !== "readonly" ? (
              <TableHead className="w-44 text-right">Actions</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((l) => (
            <TableRow key={l.unitId}>
              {mode !== "mine" ? (
                <TableCell>
                  <PersonChip
                    name={personLabel(l.userUnitId, l.userName)}
                    unitId={l.userUnitId}
                    subtitle={l.userUnitId}
                  />
                </TableCell>
              ) : null}
              <TableCell>
                <p className="font-medium text-navy">
                  {formatDayShort(l.fromDate)}
                  {l.fromDate !== l.toDate ? (
                    <>
                      <span className="mx-1 text-muted-foreground">→</span>
                      {formatDayShort(l.toDate)}
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {leaveDays(l.fromDate, l.toDate)}
                </p>
              </TableCell>
              <TableCell className="hidden max-w-xs lg:table-cell">
                <p className="truncate text-muted-foreground">
                  {l.reason ?? "—"}
                </p>
                {l.status === "rejected" && l.rejectReason ? (
                  <p className="mt-0.5 truncate text-xs text-destructive">
                    {l.rejectReason}
                  </p>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge
                  variant={LEAVE_VARIANT[l.status] ?? "outline"}
                  className="normal-case"
                >
                  {l.status}
                </Badge>
              </TableCell>
              {mode === "approve" ? (
                <TableCell className="text-right">
                  <div className="inline-flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      disabled={deciding || l.userUnitId === currentUserUnitId}
                      onClick={() => onApprove?.(l.unitId)}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={deciding || l.userUnitId === currentUserUnitId}
                      onClick={() => onReject?.(l)}
                    >
                      Reject
                    </Button>
                  </div>
                </TableCell>
              ) : null}
              {mode === "mine" ? (
                <TableCell className="text-right">
                  {l.status === "pending" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={cancelBusyId === l.unitId}
                      onClick={() => onCancel?.(l)}
                    >
                      {cancelBusyId === l.unitId ? "Cancelling…" : "Cancel"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
