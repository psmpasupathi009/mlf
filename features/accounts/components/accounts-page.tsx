"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  FileSpreadsheet,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { PageHeader } from "@/shared/components/data/page-header";
import { DataToolbar } from "@/shared/components/data/data-toolbar";
import { PaginationBar } from "@/shared/components/data/pagination-bar";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { UnitIdBadge } from "@/shared/components/data/unit-id-badge";
import { ImportDialog } from "@/shared/components/data/import-dialog";
import { DatePicker } from "@/shared/components/forms/date-picker";
import { ClientPicker } from "@/features/clients/components/client-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { apiFetch, apiDownload, getErrorMessage } from "@/lib/api/client";
import type { PublicUser } from "@/lib/auth/session";
import type { PaymentSummary } from "@/features/accounts/server/serialize";
import { PaymentFormDialog } from "@/features/accounts/components/payment-form-dialog";
import { VoidPaymentDialog } from "@/features/accounts/components/void-payment-dialog";
import { PaymentDetailDrawer } from "@/features/accounts/components/payment-detail-drawer";
import { PAYMENT_PURPOSE_OPTIONS } from "@/features/accounts/lib/payment-purposes";
import {
  dayKeyToFromIso,
  dayKeyToToIso,
  indianFyBounds,
  thisMonthBounds,
  type PeriodPreset,
} from "@/features/accounts/lib/period";
import { istDisplayDate } from "@/lib/utils/ist";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { cn } from "@/lib/utils/cn";

type PaymentRow = PaymentSummary & { clientName: string | null };
type FeeSummary = {
  agreedFee: number | null;
  collected: number;
  outstanding: number | null;
};
type ListResponse = {
  data: PaymentRow[];
  meta: { page: number; pageSize: number; total: number };
  summary: {
    paid: number;
    pending: number;
    void: number;
    netCollected: number;
    entryCount: number;
  };
  fee: FeeSummary | null;
};

const STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "muted"
> = {
  pending: "warning",
  paid: "success",
  void: "muted",
};

const PERIOD_CHIPS: { id: PeriodPreset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "month", label: "This month" },
  { id: "fy", label: "This FY" },
  { id: "custom", label: "Custom range" },
];

const STATUS_CHIPS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "pending", label: "Pending" },
  { id: "void", label: "Void" },
];

function rupee(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function truncate(s: string | null, n = 40) {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function AccountsPage({ user }: { user: PublicUser }) {
  const can = (action: string) =>
    user.permissions.includes(`accounts.${action}`);
  const canImport = can("upload") || user.roles.includes("admin");
  const canUploadReceipt =
    user.permissions.includes("cases.upload") ||
    user.permissions.includes("accounts.edit");
  const searchParams = useSearchParams();
  const router = useRouter();
  const caseUnitId = searchParams.get("caseUnitId") ?? "";
  const clientUnitId = searchParams.get("clientUnitId") ?? "";

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    paid: 0,
    pending: 0,
    void: 0,
    netCollected: 0,
    entryCount: 0,
  });
  const [fee, setFee] = useState<FeeSummary | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [status, setStatus] = useState("all");
  const [purpose, setPurpose] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (!clientUnitId) return;
    const named = rows.find(
      (r) => r.clientUnitId === clientUnitId && r.clientName
    );
    const name = named?.clientName;
    if (!name) return;
    setClientNames((prev) =>
      prev[clientUnitId] === name ? prev : { ...prev, [clientUnitId]: name }
    );
  }, [rows, clientUnitId]);

  useEffect(() => {
    if (searchParams.get("new") !== "1" || !can("create")) return;
    queueMicrotask(() => {
      setFormOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("new");
      const qs = next.toString();
      router.replace(qs ? `/accounts?${qs}` : "/accounts", { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customRangeReady =
    period !== "custom" || (Boolean(customFrom) && Boolean(customTo));
  const customRangeInvalid =
    period === "custom" &&
    Boolean(customFrom) &&
    Boolean(customTo) &&
    customFrom > customTo;

  const dateRange = useMemo(() => {
    if (period === "month") return thisMonthBounds();
    if (period === "fy") return indianFyBounds();
    if (period === "custom") {
      if (!customFrom || !customTo || customFrom > customTo) {
        return { from: undefined, to: undefined };
      }
      return {
        from: dayKeyToFromIso(customFrom),
        to: dayKeyToToIso(customTo),
      };
    }
    return { from: undefined, to: undefined };
  }, [period, customFrom, customTo]);

  const activeClientId = clientUnitId;
  const clientPickerValue = clientUnitId
    ? {
        unitId: clientUnitId,
        name: clientNames[clientUnitId] ?? clientUnitId,
      }
    : null;

  const filterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (purpose !== "all") params.set("purpose", purpose);
    if (caseUnitId) params.set("caseUnitId", caseUnitId);
    if (activeClientId) params.set("clientUnitId", activeClientId);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    return params;
  }, [
    status,
    purpose,
    caseUnitId,
    activeClientId,
    debouncedSearch,
    dateRange.from,
    dateRange.to,
  ]);

  const load = useCallback(async () => {
    if (period === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setLoading(false);
      setRows([]);
      setTotal(0);
      setSummary({
        paid: 0,
        pending: 0,
        void: 0,
        netCollected: 0,
        entryCount: 0,
      });
      return;
    }
    setLoading(true);
    const params = filterParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const { ok, data } = await apiFetch<ListResponse>(
      `/api/v1/accounts?${params.toString()}`
    );
    setLoading(false);
    if (!ok) {
      toast.error(
        getErrorMessage(
          data as Record<string, unknown>,
          "Failed to load cash entries"
        )
      );
      return;
    }
    const res = data as unknown as ListResponse;
    setRows(res.data ?? []);
    setTotal(res.meta?.total ?? 0);
    setSummary(
      res.summary ?? {
        paid: 0,
        pending: 0,
        void: 0,
        netCollected: 0,
        entryCount: 0,
      }
    );
    setFee(res.fee ?? null);
  }, [page, filterParams, period, customFrom, customTo]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  function setContextQuery(next: {
    clientUnitId?: string | null;
    caseUnitId?: string | null;
  }) {
    const params = new URLSearchParams();
    const client = next.clientUnitId === undefined ? clientUnitId : next.clientUnitId;
    const caseId = next.caseUnitId === undefined ? caseUnitId : next.caseUnitId;
    if (client) params.set("clientUnitId", client);
    if (caseId) params.set("caseUnitId", caseId);
    const qs = params.toString();
    router.replace(qs ? `/accounts?${qs}` : "/accounts", { scroll: false });
    setPage(1);
  }

  function clearAllFilters() {
    setStatus("all");
    setPurpose("all");
    setSearch("");
    setPeriod("all");
    setCustomFrom("");
    setCustomTo("");
    setContextQuery({ clientUnitId: null, caseUnitId: null });
  }

  const hasActiveFilters =
    status !== "all" ||
    purpose !== "all" ||
    Boolean(search.trim()) ||
    period !== "all" ||
    Boolean(caseUnitId) ||
    Boolean(activeClientId);

  async function exportAuditPack() {
    setExporting(true);
    const params = filterParams();
    params.set("type", "accounts");
    const result = await apiDownload(
      `/api/v1/exports?${params.toString()}`,
      "accounts-audit.xlsx"
    );
    setExporting(false);
    if (!result.ok) toast.error(result.error ?? "Export failed");
    else toast.success("Audit pack downloaded");
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Accounts"
        description="Cash register for advances, fees, and actuals. Voided entries stay for audit."
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="gap-2">
                  <MoreHorizontal className="size-4" />
                  <span className="sm:inline">Tools</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {can("view") ? (
                  <DropdownMenuItem
                    disabled={exporting}
                    onSelect={() => {
                      void exportAuditPack();
                    }}
                  >
                    <Download className="size-4" />
                    {exporting ? "Exporting…" : "Export audit pack"}
                  </DropdownMenuItem>
                ) : null}
                {canImport ? (
                  <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                    <Upload className="size-4" />
                    Import CSV
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <a href="/samples/payments.sample.csv" download>
                    <FileSpreadsheet className="size-4" />
                    Download CSV sample
                  </a>
                </DropdownMenuItem>
                {hasActiveFilters ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={clearAllFilters}>
                      <X className="size-4" />
                      Clear all filters
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            {can("create") ? (
              <Button
                type="button"
                className="gap-2"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-4" />
                <span className="sm:hidden">Record</span>
                <span className="hidden sm:inline">Record entry</span>
              </Button>
            ) : null}
          </>
        }
      />

      {/* Period + status quick filters */}
      <div className="space-y-2">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [-webkit-overflow-scrolling:touch]">
          {PERIOD_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setPage(1);
                setPeriod(c.id);
              }}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                period === c.id
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted text-muted-foreground hover:text-navy"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [-webkit-overflow-scrolling:touch]">
          {STATUS_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setPage(1);
                setStatus(c.id);
              }}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                status === c.id
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted/80 text-muted-foreground hover:text-navy"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range with proper DatePickers */}
      {period === "custom" ? (
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label>From</Label>
              <DatePicker
                value={customFrom}
                onChange={(v) => {
                  setPage(1);
                  setCustomFrom(v);
                }}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label>To</Label>
              <DatePicker
                value={customTo}
                onChange={(v) => {
                  setPage(1);
                  setCustomTo(v);
                }}
              />
            </div>
            {!customRangeReady ? (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Pick both From and To dates to filter the register.
              </p>
            ) : null}
            {customRangeInvalid ? (
              <p className="text-sm text-destructive sm:col-span-2">
                From date must be on or before To date.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Context + fee completeness */}
      {(caseUnitId || activeClientId || fee) && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-muted p-2.5 text-navy">
                  <Wallet className="size-4" />
                </span>
                <div className="min-w-0 space-y-1.5">
                  <p className="font-medium text-navy">
                    {caseUnitId
                      ? "Case cash register"
                      : activeClientId
                        ? "Client ledger"
                        : "Filtered register"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {caseUnitId ? (
                      <Badge variant="outline" className="gap-1.5 pr-1">
                        <Link
                          href={`/cases/${caseUnitId}`}
                          className="hover:underline"
                        >
                          {caseUnitId}
                        </Link>
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-muted"
                          aria-label="Clear case filter"
                          onClick={() =>
                            setContextQuery({ caseUnitId: null })
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      </Badge>
                    ) : null}
                    {activeClientId ? (
                      <Badge variant="outline" className="gap-1.5 pr-1">
                        {clientNames[activeClientId] ?? activeClientId}
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-muted"
                          aria-label="Clear client filter"
                          onClick={() => {
                            setContextQuery({ clientUnitId: null });
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>

            {fee && caseUnitId ? (
              <div className="grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Agreed fee
                  </p>
                  <p className="mt-1 text-lg font-semibold text-navy">
                    {fee.agreedFee != null ? rupee(fee.agreedFee) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Fee collected
                  </p>
                  <p className="mt-1 text-lg font-semibold text-navy">
                    {rupee(fee.collected)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="sm:hidden">All-time (excl. actuals)</span>
                    <span className="hidden sm:inline">
                      All-time fees (excl. actuals) — not limited by period filter
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Outstanding
                  </p>
                  <p className="mt-1 text-lg font-semibold text-navy">
                    {fee.outstanding != null ? rupee(fee.outstanding) : "—"}
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* KPI cards — click to filter status */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {(
          [
            {
              key: "paid",
              label: "Paid",
              value: summary.paid,
              hint: "Collected in filter",
            },
            {
              key: "pending",
              label: "Pending",
              value: summary.pending,
              hint: "Awaiting receipt",
            },
            {
              key: "void",
              label: "Void",
              value: summary.void,
              hint: "Kept for audit",
            },
            {
              key: "all",
              label: "Net collected",
              value: summary.netCollected,
              hint: `${summary.entryCount} entries`,
            },
          ] as const
        ).map((kpi) => {
          const active =
            kpi.key === "all" ? status === "all" : status === kpi.key;
          return (
            <button
              key={kpi.key}
              type="button"
              onClick={() => {
                setPage(1);
                setStatus(kpi.key);
              }}
              className={cn(
                "rounded-xl border bg-card p-3 text-left transition-colors sm:p-5",
                active
                  ? "border-navy/40 ring-1 ring-navy/20"
                  : "border-border/80 hover:border-navy/25"
              )}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {kpi.label}
              </p>
              <p className="mt-1.5 text-base font-semibold text-navy sm:mt-2 sm:text-xl">
                {rupee(kpi.value)}
              </p>
              <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
                {kpi.hint}
              </p>
            </button>
          );
        })}
      </div>

      <DataToolbar
        search={
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search PAY / client / case…"
              className="w-full pl-9"
            />
          </div>
        }
        filters={
          <>
            <div className="w-full min-w-0 sm:w-56">
              <ClientPicker
                label=""
                value={clientPickerValue}
                onChange={(c) => {
                  if (c) {
                    setClientNames((prev) => ({ ...prev, [c.unitId]: c.name }));
                  }
                  setContextQuery({
                    clientUnitId: c?.unitId ?? null,
                  });
                }}
              />
            </div>
            <Select
              value={purpose}
              onValueChange={(v) => {
                setPage(1);
                setPurpose(v);
              }}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Purpose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All purposes</SelectItem>
                {PAYMENT_PURPOSE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
          can("view") ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={exporting}
              onClick={() => void exportAuditPack()}
            >
              <Download className="size-4" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
          ) : undefined
        }
      />

      {loading && rows.length === 0 ? (
        <div className="space-y-2">
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : !loading && rows.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching entries" : "No cash entries yet"}
          description={
            hasActiveFilters
              ? "Try another period, status, or clear filters."
              : "Record an advance, stage payment, or actuals against a client."
          }
          action={
            hasActiveFilters ? (
              <Button type="button" variant="outline" onClick={clearAllFilters}>
                Clear filters
              </Button>
            ) : can("create") ? (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Record first entry
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Mobile card list */}
          <div className="space-y-2 md:hidden">
            {rows.map((p) => (
              <div
                key={p.unitId}
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(p.unitId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailId(p.unitId);
                  }
                }}
                className="flex w-full flex-col gap-2 rounded-xl border border-border/80 bg-card p-3.5 text-left transition-colors active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-medium text-navy">
                      {p.clientName ?? p.clientUnitId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.unitId}
                      {p.caseUnitId ? ` · ${p.caseUnitId}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-navy">{rupee(p.amount)}</p>
                    <Badge
                      variant={STATUS_VARIANT[p.status] ?? "outline"}
                      className="mt-1"
                    >
                      {p.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{p.typeLabel}</span>
                  {p.paidOn ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{istDisplayDate(new Date(p.paidOn))}</span>
                    </>
                  ) : null}
                </div>
                {p.status === "void" && p.voidReason ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    Void: {p.voidReason}
                  </p>
                ) : p.notes ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {p.notes}
                  </p>
                ) : null}
                <div
                  className="flex justify-end gap-1 pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setDetailId(p.unitId)}
                  >
                    View
                  </Button>
                  {can("edit") && p.status !== "void" ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-8"
                      onClick={() => setVoiding(p.unitId)}
                    >
                      Void
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border/80 bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden lg:table-cell">ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Paid on</TableHead>
                  <TableHead className="hidden xl:table-cell">Notes</TableHead>
                  <TableHead className="w-12 text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow
                    key={p.unitId}
                    className="cursor-pointer"
                    onClick={() => setDetailId(p.unitId)}
                  >
                    <TableCell className="hidden lg:table-cell">
                      <UnitIdBadge value={p.unitId} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-medium text-navy">
                          {p.clientName ?? p.clientUnitId}
                        </span>
                        {p.status === "void" && p.voidReason ? (
                          <p className="text-xs text-muted-foreground">
                            Void: {truncate(p.voidReason, 48)}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.caseUnitId ? (
                        <Link
                          href={`/cases/${p.caseUnitId}`}
                          className="text-navy underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.caseUnitId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{p.typeLabel}</TableCell>
                    <TableCell className="text-right font-medium text-navy">
                      {rupee(p.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {p.paidOn ? istDisplayDate(new Date(p.paidOn)) : "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-48 truncate xl:table-cell">
                      {truncate(p.notes)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            aria-label="Row actions"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onSelect={() => setDetailId(p.unitId)}
                          >
                            View detail
                          </DropdownMenuItem>
                          {can("edit") && p.status !== "void" ? (
                            <>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditing(p);
                                  setFormOpen(true);
                                }}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setVoiding(p.unitId)}
                              >
                                Void
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      <PaymentFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditing(null);
        }}
        defaultClientUnitId={activeClientId || undefined}
        defaultCaseUnitId={caseUnitId || undefined}
        payment={editing}
        onSaved={load}
      />

      <PaymentDetailDrawer
        open={Boolean(detailId)}
        onOpenChange={(v) => !v && setDetailId(null)}
        unitId={detailId}
        canEdit={can("edit")}
        canUploadReceipt={canUploadReceipt}
        onEdit={(p) => {
          setDetailId(null);
          setEditing(p as PaymentRow);
          setFormOpen(true);
        }}
        onVoid={(id) => {
          setDetailId(null);
          setVoiding(id);
        }}
        onFilterClient={(id) => {
          setDetailId(null);
          setContextQuery({ clientUnitId: id });
        }}
        onChanged={load}
      />

      {voiding ? (
        <VoidPaymentDialog
          open={Boolean(voiding)}
          onOpenChange={(v) => !v && setVoiding(null)}
          unitId={voiding}
          onVoided={() => {
            void load();
            if (detailId === voiding) setDetailId(null);
          }}
        />
      ) : null}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import cash entries"
        endpoint="/api/v1/accounts/import"
        sampleHref="/samples/payments.sample.csv"
        columnsHint="Need caseUnitId or clientUnitId, amount, type (advance/partial/full/consultation/court_fee/stamp/copying/travel/clerkage/other), status (pending/paid). Notes required for other."
        onImported={load}
      />
    </section>
  );
}
