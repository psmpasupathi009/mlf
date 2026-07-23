"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
import { DataToolbar } from "@/shared/components/data/data-toolbar";
import { PaginationBar } from "@/shared/components/data/pagination-bar";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { UnitIdBadge } from "@/shared/components/data/unit-id-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { AppointmentSummary } from "@/features/appointments/server/serialize";
import { AppointmentFormDialog } from "@/features/appointments/components/appointment-form-dialog";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { istDateKey, istDayBounds } from "@/lib/utils/ist";
import { cn } from "@/lib/utils/cn";
import { canBookForAnyAdvocate } from "@/lib/appointments/booking-rules";
import { displayMobile } from "@/lib/auth/mobile";
import { PersonChip } from "@/shared/components/user/person-chip";

type ListResponse = {
  data: AppointmentSummary[];
  meta: { page: number; pageSize: number; total: number };
};

type AdvocateOption = { unitId: string; name: string; mobile: string };

const STATUS_VARIANT: Record<string, "default" | "success" | "muted"> = {
  scheduled: "default",
  completed: "success",
  cancelled: "muted",
};

type Range = "all" | "today" | "upcoming";

export function AppointmentsPage({ user }: { user: PublicUser }) {
  const can = (action: string) =>
    user.permissions.includes(`appointments.${action}`);
  const bookAny = canBookForAnyAdvocate(user.roles);

  const [rows, setRows] = useState<AppointmentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("scheduled");
  const [range, setRange] = useState<Range>("today");
  const [advocateFilter, setAdvocateFilter] = useState("all");
  const [advocates, setAdvocates] = useState<AdvocateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentSummary | null>(null);

  useEffect(() => {
    if (!bookAny) return;
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch<{ data: AdvocateOption[] }>(
        "/api/v1/advocates?pageSize=100"
      );
      if (!cancelled && ok && data && typeof data === "object") {
        const list =
          "data" in data && Array.isArray((data as { data: unknown }).data)
            ? (data as { data: AdvocateOption[] }).data
            : [];
        setAdvocates(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookAny]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (status !== "all") params.set("status", status);
    if (bookAny && advocateFilter !== "all") {
      params.set("advocateMobile", advocateFilter);
    }

    if (range === "today") {
      const { start, end } = istDayBounds(istDateKey());
      params.set("from", start.toISOString());
      params.set("to", end.toISOString());
    } else if (range === "upcoming") {
      params.set("from", new Date().toISOString());
    }

    const { ok, data } = await apiFetch<ListResponse>(
      `/api/v1/appointments?${params.toString()}`
    );
    setLoading(false);
    if (!ok) {
      toast.error(
        getErrorMessage(
          data as Record<string, unknown>,
          "Failed to load appointments"
        )
      );
      return;
    }
    setRows((data as unknown as ListResponse).data ?? []);
    setTotal((data as unknown as ListResponse).meta?.total ?? 0);
  }, [page, debouncedSearch, status, range, bookAny, advocateFilter]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const canCreate = user.permissions.includes("appointments.create");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      if (params.get("new") === "1" && canCreate) {
        setEditing(null);
        setFormOpen(true);
      }
      if (params.get("hearing") === "today") {
        setRange("today");
      }
    });
  }, [canCreate]);

  async function handleCancel(unitId: string) {
    const { ok, data } = await apiFetch(`/api/v1/appointments/${unitId}`, {
      method: "PATCH",
      json: { status: "cancelled" },
    });
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to cancel")
      );
      return;
    }
    toast.success("Appointment cancelled");
    void load();
  }

  async function handleComplete(unitId: string) {
    const { ok, data } = await apiFetch(`/api/v1/appointments/${unitId}`, {
      method: "PATCH",
      json: { status: "completed" },
    });
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to update")
      );
      return;
    }
    toast.success("Marked completed");
    void load();
  }

  const chips: { id: Range; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "upcoming", label: "Upcoming" },
    { id: "all", label: "All" },
  ];

  return (
    <section>
      <PageHeader
        title="Appointments"
        description={
          bookAny
            ? "Book for any advocate by name. Filter the diary by advocate."
            : "Your consultation diary — book appointments under your name."
        }
        actions={
          can("create") ? (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Book appointment
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setPage(1);
              setRange(c.id);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              range === c.id
                ? "bg-navy text-white"
                : "bg-muted text-muted-foreground hover:text-navy"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <DataToolbar
        search={
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search title…"
            className="w-full"
          />
        }
        filters={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
            {bookAny ? (
              <Select
                value={advocateFilter}
                onValueChange={(v) => {
                  setPage(1);
                  setAdvocateFilter(v);
                }}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Advocate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All advocates</SelectItem>
                  {advocates.map((a) => (
                    <SelectItem key={a.unitId} value={displayMobile(a.mobile)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={status}
              onValueChange={(v) => {
                setPage(1);
                setStatus(v);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {!loading && rows.length === 0 ? (
        <EmptyState
          title={range === "today" ? "No appointments today" : "No appointments"}
          description="Schedule a client visit or call."
          action={
            can("create") ? (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Book appointment
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Advocate</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.unitId}>
                  <TableCell>
                    <UnitIdBadge value={a.unitId} />
                  </TableCell>
                  <TableCell className="font-medium text-navy">{a.title}</TableCell>
                  <TableCell>
                    {a.advocateName || a.advocateMobile ? (
                      <PersonChip
                        name={a.advocateName}
                        photoUrl={a.advocatePhotoUrl}
                        mobile={a.advocateMobile}
                        unitId={a.advocateUnitId}
                        subtitle={a.advocateMobile ? `+91 ${a.advocateMobile}` : undefined}
                      />
                    ) : (
                      <span className="text-amber-700">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>{a.clientName ?? a.clientUnitId ?? "—"}</TableCell>
                  <TableCell>
                    {new Date(a.scheduledAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="capitalize">{a.mode ?? "office"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[a.status] ?? "outline"}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {can("edit") && a.status === "scheduled" ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleComplete(a.unitId)}
                          >
                            Done
                          </Button>
                          {can("cancel") ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancel(a.unitId)}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                      {can("edit") ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(a);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      <AppointmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        appointment={editing}
        user={user}
        onSaved={load}
      />
    </section>
  );
}
