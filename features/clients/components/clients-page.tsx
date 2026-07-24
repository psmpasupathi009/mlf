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
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";

type ListResponse = { data: ClientSummary[]; meta: { page: number; pageSize: number; total: number } };

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

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Add the first client — staff can then register cases against them."
          action={
            can("create") ? (
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
                <TableHead>Email</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.unitId}>
                  <TableCell><UnitIdBadge value={c.unitId} /></TableCell>
                  <TableCell className="font-medium text-navy">{c.name}</TableCell>
                  <TableCell>+91 {c.mobile}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{c.address ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button asChild type="button" variant="outline" size="sm">
                        <Link href={`/cases?clientUnitId=${c.unitId}`}>Cases</Link>
                      </Button>
                      {can("edit") ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(c);
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
