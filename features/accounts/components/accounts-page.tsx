"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
import { DataToolbar } from "@/shared/components/data/data-toolbar";
import { PaginationBar } from "@/shared/components/data/pagination-bar";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { UnitIdBadge } from "@/shared/components/data/unit-id-badge";
import { ImportDialog } from "@/shared/components/data/import-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

type PaymentRow = PaymentSummary & { clientName: string | null };
type ListResponse = {
  data: PaymentRow[];
  meta: { page: number; pageSize: number; total: number };
  summary: { paid: number; pending: number; void: number };
};

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  pending: "warning",
  paid: "success",
  void: "muted",
};

export function AccountsPage({ user }: { user: PublicUser }) {
  const can = (action: string) => user.permissions.includes(`accounts.${action}`);
  const canImport = can("upload") || user.roles.includes("admin");
  const searchParams = useSearchParams();
  const router = useRouter();
  const caseUnitId = searchParams.get("caseUnitId") ?? "";
  const clientUnitId = searchParams.get("clientUnitId") ?? "";

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ paid: 0, pending: 0, void: 0 });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status !== "all") params.set("status", status);
    if (caseUnitId) params.set("caseUnitId", caseUnitId);
    if (clientUnitId) params.set("clientUnitId", clientUnitId);
    const { ok, data } = await apiFetch<ListResponse>(`/api/v1/accounts?${params.toString()}`);
    setLoading(false);
    if (!ok) {
      toast.error(getErrorMessage(data as Record<string, unknown>, "Failed to load cash entries"));
      return;
    }
    const res = data as unknown as ListResponse;
    setRows(res.data ?? []);
    setTotal(res.meta?.total ?? 0);
    setSummary(res.summary ?? { paid: 0, pending: 0, void: 0 });
  }, [page, status, caseUnitId, clientUnitId]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await load();
    })();
  }, [load]);

  const rupee = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <section>
      <PageHeader
        title="Accounts"
        description="Cash advances and payments — accountants view, admins record and edit."
        actions={
          <>
            {can("view") ? (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const result = await apiDownload(
                    "/api/v1/exports?type=accounts",
                    "accounts.xlsx"
                  );
                  if (!result.ok) toast.error(result.error ?? "Export failed");
                }}
              >
                Export Excel
              </Button>
            ) : null}
            {canImport ? (
              <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
                Import CSV
              </Button>
            ) : null}
            {can("create") ? (
              <Button type="button" onClick={() => setFormOpen(true)}>
                Record entry
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
            <p className="mt-2 text-xl font-semibold text-navy">{rupee(summary.paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending</p>
            <p className="mt-2 text-xl font-semibold text-navy">{rupee(summary.pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Void</p>
            <p className="mt-2 text-xl font-semibold text-navy">{rupee(summary.void)}</p>
          </CardContent>
        </Card>
      </div>

      <DataToolbar
        filters={
          <Select
            value={status}
            onValueChange={(v) => {
              setPage(1);
              setStatus(v);
            }}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {!loading && rows.length === 0 ? (
        <EmptyState title="No cash entries yet" description="Record the first advance or payment." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden lg:table-cell">ID</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Case</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.unitId}>
                  <TableCell className="hidden lg:table-cell">
                    <UnitIdBadge value={p.unitId} />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <span>{p.clientName ?? p.clientUnitId}</span>
                      <p className="text-xs text-muted-foreground md:hidden">
                        {p.caseUnitId ?? "No case"} ·{" "}
                        <span className="capitalize">{p.type}</span>
                      </p>
                      <div className="sm:hidden">
                        <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {p.caseUnitId ?? "—"}
                  </TableCell>
                  <TableCell className="hidden capitalize sm:table-cell">
                    {p.type}
                  </TableCell>
                  <TableCell className="font-medium text-navy">{rupee(p.amount)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {can("edit") && p.status !== "void" ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="px-2 sm:px-3"
                        onClick={() => setVoiding(p.unitId)}
                      >
                        Void
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </>
      )}

      <PaymentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultClientUnitId={clientUnitId || undefined}
        defaultCaseUnitId={caseUnitId || undefined}
        onSaved={load}
      />

      {voiding ? (
        <VoidPaymentDialog
          open={Boolean(voiding)}
          onOpenChange={(v) => !v && setVoiding(null)}
          unitId={voiding}
          onVoided={load}
        />
      ) : null}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import cash entries"
        endpoint="/api/v1/accounts/import"
        sampleHref="/samples/payments.sample.csv"
        columnsHint="Need caseUnitId or clientUnitId, amount, type (advance/partial/full), status (pending/paid)."
        onImported={load}
      />
    </section>
  );
}
