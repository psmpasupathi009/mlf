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
import { Input } from "@/components/ui/input";
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
import type { ClientSummary } from "@/features/clients/server/serialize";
import { ClientFormDialog } from "@/features/clients/components/client-form-dialog";
import { ClientRowActions } from "@/features/clients/components/client-row-actions";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";

type ListResponse = { data: ClientSummary[]; meta: { page: number; pageSize: number; total: number } };

function locationLine(c: ClientSummary) {
  return [c.city, c.district].filter(Boolean).join(", ") || c.address || null;
}

export function ClientsPage({ user }: { user: PublicUser }) {
  const can = (action: string) => user.permissions.includes(`clients.${action}`);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [rows, setRows] = useState<ClientSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ClientSummary | null>(null);

  useEffect(() => {
    if (searchParams.get("new") !== "1" || !can("create")) return;
    queueMicrotask(() => {
      setEditing(null);
      setFormOpen(true);
      router.replace("/clients", { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set("q", debouncedSearch);
    const { ok, data } = await apiFetch<ListResponse>(`/api/v1/clients?${params.toString()}`);
    setLoading(false);
    if (!ok) {
      toast.error(getErrorMessage(data as Record<string, unknown>, "Failed to load clients"));
      return;
    }
    setRows((data as unknown as ListResponse).data ?? []);
    setTotal((data as unknown as ListResponse).meta?.total ?? 0);
  }, [page, debouncedSearch]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const hasSearch = Boolean(debouncedSearch);
  const showEmpty = !loading && rows.length === 0;

  return (
    <section>
      <PageHeader
        title="Clients"
        description="The office client book — everyone with access sees the same list."
        actions={
          <>
            {can("create") ? (
              <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
                Import CSV
              </Button>
            ) : null}
            {can("create") ? (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Add client
              </Button>
            ) : null}
          </>
        }
      />

      <DataToolbar
        search={
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search name, mobile, ID…"
            className="w-full"
          />
        }
      />

      {showEmpty ? (
        <EmptyState
          title={hasSearch ? "No clients match" : "No clients yet"}
          description={
            hasSearch
              ? "Try a different name, mobile, or ID."
              : "Add the first client — staff can then register cases against them."
          }
          action={
            can("create") && !hasSearch ? (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Add first client
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
                <TableHead>Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Address</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={6}>
                        <div className="h-10 animate-pulse rounded-md bg-muted/60" />
                      </TableCell>
                    </TableRow>
                  ))
                : rows.map((c) => {
                    const secondary = locationLine(c);
                    return (
                      <TableRow key={c.unitId}>
                        <TableCell>
                          <UnitIdBadge value={c.unitId} />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium text-navy">{c.name}</p>
                            {secondary ? (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                                {secondary}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">+91 {c.mobile}</TableCell>
                        <TableCell className="hidden md:table-cell">{c.email ?? "—"}</TableCell>
                        <TableCell className="hidden max-w-xs truncate md:table-cell">
                          {c.address ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <ClientRowActions
                            client={c}
                            canEdit={can("edit")}
                            onEdit={() => {
                              setEditing(c);
                              setFormOpen(true);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>

          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </>
      )}

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} onSaved={load} />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import clients"
        endpoint="/api/v1/clients/import"
        sampleHref="/samples/clients.sample.csv"
        columnsHint="Required: name, mobile. Optional: address, city, district, state, referredBy…"
        onImported={load}
      />
    </section>
  );
}
