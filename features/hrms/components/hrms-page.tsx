"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
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
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import type { PublicUser } from "@/lib/auth/session";
import type {
  AttendanceSummary,
  LeaveSummary,
} from "@/features/hrms/server/serialize";
import type { PresenceBoard } from "@/features/hrms/server/presence";
import { LeaveApplyDialog } from "@/features/hrms/components/leave-apply-dialog";
import { PresenceTodaySection } from "@/features/hrms/components/presence-today-section";
import { AttendanceHistorySection } from "@/features/hrms/components/attendance-history-section";
import { LeaveSection } from "@/features/hrms/components/leave-section";
import { useHrmsSectionFromUrl } from "@/features/hrms/components/use-hrms-section-from-url";
import {
  type AttendanceList,
  type DeskSection,
  type LeaveList,
  SelfStatusBadge,
  formatTime,
  personLabel,
} from "@/features/hrms/components/hrms-page-helpers";
import {
  last30DateKeys,
  thisMonthDateKeys,
  type HistoryPeriod,
} from "@/features/hrms/lib/period";
import { leaveCoversDate } from "@/features/hrms/lib/status";
import { istDateKey } from "@/lib/utils/ist";
import { cn } from "@/lib/utils/cn";

export function HrmsPage({ user }: { user: PublicUser }) {
  const canManageAttendance = user.permissions.includes("hrms.manage_attendance");
  const canApproveLeave = user.permissions.includes("hrms.approve_leave");
  const canOwnAttendance = user.permissions.includes("hrms.own_attendance");
  const canOwnLeave = user.permissions.includes("hrms.own_leave");

  const { section, setSection, applyOpen, setApplyOpen } =
    useHrmsSectionFromUrl(canOwnLeave);

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
        <PresenceTodaySection
          loading={loading}
          onLeaveToday={onLeaveToday}
          pendingLeaveToday={pendingLeaveToday}
          todayRecord={todayRecord}
          canManageAttendance={canManageAttendance}
          presence={presence}
        />
      ) : null}

      {section === "history" ? (
        <AttendanceHistorySection
          history={history}
          historyTotal={historyTotal}
          historyLoading={historyLoading}
          historyPeriod={historyPeriod}
          customFrom={customFrom}
          customTo={customTo}
          historyRange={historyRange}
          onPeriodChange={setHistoryPeriod}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      ) : null}

      {section === "leave" ? (
        <LeaveSection
          loading={loading}
          canApproveLeave={canApproveLeave}
          canOwnLeave={canOwnLeave}
          currentUserUnitId={user.unitId}
          leaveInboxTab={leaveInboxTab}
          pendingLeave={pendingLeave}
          pendingLeaveTotal={pendingLeaveTotal}
          decidedLeave={decidedLeave}
          decidedLeaveTotal={decidedLeaveTotal}
          myLeave={myLeave}
          deciding={deciding}
          cancelBusyId={cancelBusyId}
          onLeaveInboxTabChange={setLeaveInboxTab}
          onApplyLeave={openApplyLeave}
          onApprove={handleApprove}
          onReject={(l) => {
            setRejectReason("");
            setRejectTarget(l);
          }}
          onCancel={(l) => setCancelTarget(l)}
        />
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
              Notes are for the team board only — they do not close booking
              slots. Checked out later means you left for the day. Use Apply
              leave for full days away.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="checkin-notes">Note (optional)</Label>
              <Textarea
                id="checkin-notes"
                value={checkInNotes}
                onChange={(e) => setCheckInNotes(e.target.value)}
                placeholder="e.g. At Gobichettipalayam court"
                rows={3}
              />
            </div>
            <p className="rounded-xl border border-border/80 bg-muted/25 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              Going to court or a client site for part of the day?{" "}
              <Link
                href="/availability"
                className="font-medium text-navy underline-offset-2 hover:underline"
                onClick={() => setCheckInOpen(false)}
              >
                Block booking hours on Availability
              </Link>{" "}
              so clients cannot book that window.
            </p>
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
