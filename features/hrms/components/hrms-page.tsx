"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
import { EmptyState } from "@/shared/components/feedback/empty-state";
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
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import type { PublicUser } from "@/lib/auth/session";
import type { AttendanceSummary, LeaveSummary } from "@/features/hrms/server/serialize";
import { LeaveApplyDialog } from "@/features/hrms/components/leave-apply-dialog";
import { istDateKey } from "@/lib/utils/ist";

type AttendanceList = { data: AttendanceSummary[]; meta: { total: number } };
type LeaveList = { data: LeaveSummary[]; meta: { total: number } };

const LEAVE_VARIANT: Record<string, "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

function personLabel(unitId: string, name: string | null | undefined) {
  return name?.trim() || unitId;
}

export function HrmsPage({ user }: { user: PublicUser }) {
  const canManageAttendance = user.permissions.includes("hrms.manage_attendance");
  const canApproveLeave = user.permissions.includes("hrms.approve_leave");

  const [myAttendance, setMyAttendance] = useState<AttendanceSummary[]>([]);
  const [myLeave, setMyLeave] = useState<LeaveSummary[]>([]);
  const [teamAttendance, setTeamAttendance] = useState<AttendanceSummary[]>([]);
  const [pendingLeave, setPendingLeave] = useState<LeaveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<LeaveSummary | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deciding, setDeciding] = useState(false);

  const today = istDateKey();
  const todayRecord = myAttendance.find((a) => a.date === today) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [attRes, leaveRes] = await Promise.all([
        apiFetch<AttendanceList>("/api/v1/hrms/attendance?pageSize=10"),
        apiFetch<LeaveList>("/api/v1/hrms/leave?pageSize=10"),
      ]);
      if (!attRes.ok) {
        toast.error(getErrorMessage(attRes.data as Record<string, unknown>, "Failed to load attendance"));
      } else {
        setMyAttendance((attRes.data as unknown as AttendanceList).data ?? []);
      }
      if (!leaveRes.ok) {
        toast.error(getErrorMessage(leaveRes.data as Record<string, unknown>, "Failed to load leave"));
      } else {
        setMyLeave((leaveRes.data as unknown as LeaveList).data ?? []);
      }

      if (canManageAttendance) {
        const teamRes = await apiFetch<AttendanceList>(
          `/api/v1/hrms/attendance?from=${today}&to=${today}&pageSize=50`
        );
        if (!teamRes.ok) {
          toast.error(getErrorMessage(teamRes.data as Record<string, unknown>, "Failed to load team attendance"));
        } else {
          setTeamAttendance((teamRes.data as unknown as AttendanceList).data ?? []);
        }
      }
      if (canApproveLeave) {
        const pendingRes = await apiFetch<LeaveList>("/api/v1/hrms/leave?status=pending&pageSize=50");
        if (!pendingRes.ok) {
          toast.error(getErrorMessage(pendingRes.data as Record<string, unknown>, "Failed to load pending leave"));
        } else {
          setPendingLeave((pendingRes.data as unknown as LeaveList).data ?? []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [canManageAttendance, canApproveLeave, today]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await load();
    })();
  }, [load]);

  async function handleCheckIn() {
    const { ok, data } = await apiFetch("/api/v1/hrms/attendance/check-in", { method: "POST", json: {} });
    if (!ok) {
      toast.error(getErrorMessage(data as Record<string, unknown>, "Failed to check in"));
      return;
    }
    toast.success("Checked in");
    void load();
  }

  async function handleCheckOut() {
    const { ok, data } = await apiFetch("/api/v1/hrms/attendance/check-out", { method: "POST", json: {} });
    if (!ok) {
      toast.error(getErrorMessage(data as Record<string, unknown>, "Failed to check out"));
      return;
    }
    toast.success("Checked out");
    void load();
  }

  async function handleApprove(unitId: string) {
    setDeciding(true);
    const { ok, data } = await apiFetch(`/api/v1/hrms/leave/${unitId}/decide`, {
      method: "POST",
      json: { decision: "approved" },
    });
    setDeciding(false);
    if (!ok) {
      toast.error(getErrorMessage(data as Record<string, unknown>, "Failed to approve leave"));
      return;
    }
    toast.success("Leave approved");
    void load();
  }

  async function handleRejectSubmit() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error("Enter a brief reject reason");
      return;
    }
    setDeciding(true);
    const { ok, data } = await apiFetch(`/api/v1/hrms/leave/${rejectTarget.unitId}/decide`, {
      method: "POST",
      json: { decision: "rejected", rejectReason: reason },
    });
    setDeciding(false);
    if (!ok) {
      toast.error(getErrorMessage(data as Record<string, unknown>, "Failed to reject leave"));
      return;
    }
    toast.success("Leave rejected");
    setRejectTarget(null);
    setRejectReason("");
    void load();
  }

  return (
    <section className="space-y-6">
      <PageHeader title="HRMS" description="Attendance and leave for the whole office." />

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Today’s attendance</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleCheckIn} disabled={Boolean(todayRecord?.checkInAt)}>
              Check in
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCheckOut}
              disabled={!todayRecord?.checkInAt || Boolean(todayRecord?.checkOutAt)}
            >
              Check out
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          {todayRecord?.checkInAt
            ? `Checked in at ${new Date(todayRecord.checkInAt).toLocaleTimeString("en-IN")}`
            : "Not checked in yet"}
          {todayRecord?.checkOutAt
            ? ` · Checked out at ${new Date(todayRecord.checkOutAt).toLocaleTimeString("en-IN")}`
            : ""}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>My leave requests</CardTitle>
          <Button type="button" size="sm" onClick={() => setApplyOpen(true)}>
            Apply for leave
          </Button>
        </CardHeader>
        <CardContent className="p-0 sm:px-0">
          {!loading && myLeave.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No leave requests yet.</p>
          ) : (
            <Table containerClassName="rounded-none border-0 border-t shadow-none">
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myLeave.map((l) => (
                  <TableRow key={l.unitId}>
                    <TableCell className="whitespace-nowrap">{l.fromDate}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.toDate}</TableCell>
                    <TableCell className="truncate">{l.reason ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={LEAVE_VARIANT[l.status] ?? "outline"}>{l.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canApproveLeave ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending leave approvals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pendingLeave.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState title="No pending requests" description="You're all caught up." />
              </div>
            ) : (
              <Table containerClassName="rounded-none border-0 border-t shadow-none">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingLeave.map((l) => (
                    <TableRow key={l.unitId}>
                      <TableCell>
                        <div className="font-medium text-navy truncate">
                          {personLabel(l.userUnitId, l.userName)}
                        </div>
                        {l.userName ? (
                          <div className="text-xs text-muted-foreground">{l.userUnitId}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{l.fromDate}</TableCell>
                      <TableCell className="whitespace-nowrap">{l.toDate}</TableCell>
                      <TableCell className="truncate">{l.reason ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={deciding || l.userUnitId === user.unitId}
                            onClick={() => handleApprove(l.unitId)}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={deciding || l.userUnitId === user.unitId}
                            onClick={() => {
                              setRejectReason("");
                              setRejectTarget(l);
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {canManageAttendance ? (
        <Card>
          <CardHeader>
            <CardTitle>Team attendance — today</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {teamAttendance.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">No one has checked in yet today.</p>
            ) : (
              <Table containerClassName="rounded-none border-0 border-t shadow-none">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Check in</TableHead>
                    <TableHead>Check out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamAttendance.map((a) => (
                    <TableRow key={a.unitId}>
                      <TableCell>
                        <div className="font-medium text-navy">{personLabel(a.userUnitId, a.userName)}</div>
                        {a.userName ? (
                          <div className="text-xs text-muted-foreground">{a.userUnitId}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {a.checkInAt ? new Date(a.checkInAt).toLocaleTimeString("en-IN") : "—"}
                      </TableCell>
                      <TableCell>
                        {a.checkOutAt ? new Date(a.checkOutAt).toLocaleTimeString("en-IN") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <LeaveApplyDialog open={applyOpen} onOpenChange={setApplyOpen} onSaved={load} />

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
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
            <Button type="button" variant="destructive" disabled={deciding} onClick={handleRejectSubmit}>
              {deciding ? "Rejecting…" : "Reject leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
