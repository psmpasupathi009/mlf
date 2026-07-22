"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
import { DataToolbar } from "@/shared/components/data/data-toolbar";
import { PaginationBar } from "@/shared/components/data/pagination-bar";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { UnitIdBadge } from "@/shared/components/data/unit-id-badge";
import { ImportDialog } from "@/shared/components/data/import-dialog";
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
import { apiFetch, apiDownload, getErrorMessage } from "@/lib/api/client";
import type { PublicUser } from "@/lib/auth/session";
import type { CaseSummary } from "@/features/cases/server/serialize";
import { CaseFormDialog } from "@/features/cases/components/case-form-dialog";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { cn } from "@/lib/utils/cn";

type CaseRow = CaseSummary & { clientName: string | null };
type ListResponse = {
  data: CaseRow[];
  meta: { page: number; pageSize: number; total: number };
};

const STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "muted"
> = {
  pending: "warning",
  listed: "default",
  disposed: "success",
  withdrawn: "muted",
  transferred: "muted",
};

type QuickFilter = "all" | "today" | "week" | "missingCourt";

export function CasesPage({ user }: { user: PublicUser }) {
  const can = (action: string) => user.permissions.includes(`cases.${action}`);
  const searchParams = useSearchParams();
  const router = useRouter();
  const clientUnitId = searchParams.get("clientUnitId") ?? "";

  const initialQuick: QuickFilter =
    searchParams.get("hearing") === "today"
      ? "today"
      : searchParams.get("hearing") === "week"
        ? "week"
        : searchParams.get("missingCourtNumber") === "1"
          ? "missingCourt"
          : "all";

  const [rows, setRows] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<string>("all");
  const [quick, setQuick] = useState<QuickFilter>(initialQuick);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [hearingsImportOpen, setHearingsImportOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") !== "1" || !can("create")) return;
    queueMicrotask(() => {
      setFormOpen(true);
      router.replace("/cases", { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from query
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (status !== "all") params.set("status", status);
    if (clientUnitId) params.set("clientUnitId", clientUnitId);
    if (quick === "today") params.set("hearing", "today");
    if (quick === "week") params.set("hearing", "week");
    if (quick === "missingCourt") params.set("missingCourtNumber", "1");

    const { ok, data } = await apiFetch<ListResponse>(
      `/api/v1/cases?${params.toString()}`
    );
    setLoading(false);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to load cases")
      );
      return;
    }
    setRows((data as unknown as ListResponse).data ?? []);
    setTotal((data as unknown as ListResponse).meta?.total ?? 0);
  }, [page, debouncedSearch, status, clientUnitId, quick]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const chips: { id: QuickFilter; label: string }[] = [
    { id: "all", label: "All cases" },
    { id: "today", label: "Hearing today" },
    { id: "week", label: "This week" },
    { id: "missingCourt", label: "No court number" },
  ];

  return (
    <section>
      <PageHeader
        title="Cases"
        description="Office-shared cause list — search by CSE id, court number, or client."
        actions={
          can("create") ? (
            <Button type="button" onClick={() => setFormOpen(true)}>
              Register case
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
              setQuick(c.id);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              quick === c.id
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
            placeholder="Search CSE / court no / client…"
            className="w-full"
          />
        }
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
              <SelectItem value="listed">Listed</SelectItem>
              <SelectItem value="disposed">Disposed</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
              <SelectItem value="transferred">Transferred</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const result = await apiDownload(
                  "/api/v1/exports?type=cases",
                  "cases.xlsx"
                );
                if (!result.ok) toast.error(result.error ?? "Export failed");
              }}
            >
              Export Excel
            </Button>
            {can("create") ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportOpen(true)}
              >
                Import cases
              </Button>
            ) : null}
            {can("edit") ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setHearingsImportOpen(true)}
              >
                Import hearings
              </Button>
            ) : null}
          </>
        }
      />

      {!loading && rows.length === 0 ? (
        <EmptyState
          title={
            quick === "today"
              ? "No hearings today"
              : quick === "missingCourt"
                ? "No cases missing court numbers"
                : "No cases yet"
          }
          description={
            can("create")
              ? "Register a case for a client — court number can wait until allotted."
              : "Ask admin if you need access to create cases."
          }
          action={
            can("create") && quick === "all" ? (
              <Button type="button" onClick={() => setFormOpen(true)}>
                Register first case
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
                <TableHead>Court no.</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next hearing</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <div className="h-8 animate-pulse rounded bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
                : rows.map((c) => (
                    <TableRow key={c.unitId}>
                      <TableCell>
                        <UnitIdBadge value={c.unitId} />
                      </TableCell>
                      <TableCell className="font-medium text-navy">
                        {c.caseNumber ?? (
                          <span className="font-normal text-amber-700">
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{c.clientName ?? c.clientUnitId}</TableCell>
                      <TableCell>{c.courtName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.nextHearingAt
                          ? new Date(c.nextHearingAt).toLocaleDateString(
                              "en-IN"
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild type="button" variant="outline" size="sm">
                          <Link href={`/cases/${c.unitId}`}>Open</Link>
                        </Button>
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

      <CaseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(createdUnitId) => {
          void load();
          if (createdUnitId) {
            router.push(`/cases/${createdUnitId}`);
          }
        }}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import cases"
        endpoint="/api/v1/cases/import"
        sampleHref="/samples/cases.sample.csv"
        columnsHint="Need clientMobile or clientUnitId. Optional: caseNumber, court, status, nextHearingAt…"
        onImported={load}
      />

      <ImportDialog
        open={hearingsImportOpen}
        onOpenChange={setHearingsImportOpen}
        title="Import hearings"
        endpoint="/api/v1/hearings/import"
        sampleHref="/samples/hearings.sample.csv"
        columnsHint="Need caseUnitId or caseNumber, plus hearingDate (YYYY-MM-DD). Optional: purpose, notes."
        onImported={load}
      />
    </section>
  );
}
