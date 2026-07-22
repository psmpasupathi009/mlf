"use client";

import { useCallback, useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import type { PublicUser } from "@/lib/auth/session";
import type { EmployeeSummary } from "@/features/employees/server/serialize";
import { EmployeeFormDialog } from "@/features/employees/components/employee-form-dialog";

type ListResponse = { data: EmployeeSummary[]; meta: { page: number; pageSize: number; total: number } };

export function EmployeesPage({ user }: { user: PublicUser }) {
  const can = (action: string) => user.permissions.includes(`employees.${action}`);

  const [rows, setRows] = useState<EmployeeSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set("q", search);
    const { ok, data } = await apiFetch<ListResponse>(`/api/v1/employees?${params.toString()}`);
    setLoading(false);
    if (!ok) {
      toast.error(getErrorMessage(data as Record<string, unknown>, "Failed to load employees"));
      return;
    }
    setRows((data as unknown as ListResponse).data ?? []);
    setTotal((data as unknown as ListResponse).meta?.total ?? 0);
  }, [page, search]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await load();
    })();
  }, [load]);

  async function handleAction(unitId: string, action: "deactivate" | "reactivate" | "force-reset-pin") {
    const { ok, data } = await apiFetch(`/api/v1/employees/${unitId}/${action}`, { method: "POST" });
    if (!ok) {
      toast.error(getErrorMessage(data as Record<string, unknown>, "Action failed"));
      return;
    }
    toast.success(
      action === "deactivate" ? "Employee deactivated" : action === "reactivate" ? "Employee reactivated" : "PIN reset — employee must set up a new PIN"
    );
    void load();
  }

  return (
    <section>
      <PageHeader
        title="Employees"
        description="Manage staff, advocates and admin accounts."
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
                Add employee
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
          title="No employees yet"
          description="Add your first employee to get started."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((emp) => (
                <TableRow key={emp.unitId}>
                  <TableCell><UnitIdBadge value={emp.unitId} /></TableCell>
                  <TableCell className="font-medium text-navy">{emp.name ?? "—"}</TableCell>
                  <TableCell>+91 {emp.mobile}</TableCell>
                  <TableCell>{emp.designation ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {emp.roles.map((r) => (
                        <Badge key={r} variant="outline">
                          {r.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={emp.isActive ? "success" : "muted"}>
                      {emp.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {can("edit") ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(emp);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                      {can("edit") ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAction(emp.unitId, "force-reset-pin")}
                        >
                          Reset PIN
                        </Button>
                      ) : null}
                      {can("deactivate") && emp.unitId !== user.unitId ? (
                        emp.isActive ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => handleAction(emp.unitId, "deactivate")}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleAction(emp.unitId, "reactivate")}
                          >
                            Reactivate
                          </Button>
                        )
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

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        employee={editing}
        canAssignAdmin={user.roles.includes("admin")}
        onSaved={load}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import employees"
        endpoint="/api/v1/employees/import"
        sampleHref="/samples/employees.sample.csv"
        columnsHint="Required: mobile, name, designation. Optional: roles, email…"
        onImported={load}
      />
    </section>
  );
}
