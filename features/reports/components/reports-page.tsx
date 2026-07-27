"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CalendarDays,
  CheckSquare,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Mail,
  Printer,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiDownload } from "@/lib/api/client";
import type { PublicUser } from "@/lib/auth/session";
import { isModuleEnabled } from "@/config/company/modules";
import { istDateKey } from "@/lib/utils/ist";

type ReportsPageProps = {
  user: PublicUser;
};

export function ReportsPage({ user }: ReportsPageProps) {
  const can = (perm: string) => user.permissions.includes(perm);
  const [busy, setBusy] = useState<string | null>(null);
  const todayKey = istDateKey();

  async function download(type: string, filename: string, extra?: string) {
    setBusy(type);
    const qs = extra
      ? `type=${encodeURIComponent(type)}&${extra}`
      : `type=${encodeURIComponent(type)}`;
    const result = await apiDownload(`/api/v1/exports?${qs}`, filename);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "Download failed");
      return;
    }
    toast.success("Download started");
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Reports"
        description="Exports and printable day views for office ops."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {can("cases.view") && isModuleEnabled("cases") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Cases register</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Full matters export. For a filtered sheet, use Export on the
                    Cases page.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-auto w-full"
                disabled={busy === "cases"}
                onClick={() => void download("cases", "cases.xlsx")}
              >
                <Download className="size-4" />
                {busy === "cases" ? "Preparing…" : "Download Excel"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {can("clients.view") && isModuleEnabled("clients") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Briefcase className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Clients register</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Client book Excel for backup and office lists.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-auto w-full"
                disabled={busy === "clients"}
                onClick={() => void download("clients", "clients.xlsx")}
              >
                <Download className="size-4" />
                {busy === "clients" ? "Preparing…" : "Download Excel"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {can("employees.view") && isModuleEnabled("employees") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Employees register</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Staff directory with roles and designations.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-auto w-full"
                disabled={busy === "employees"}
                onClick={() => void download("employees", "employees.xlsx")}
              >
                <Download className="size-4" />
                {busy === "employees" ? "Preparing…" : "Download Excel"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {can("appointments.view") && isModuleEnabled("appointments") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Appointments</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Full booking diary export. Filtered sheets stay on
                    Appointments.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-auto w-full"
                disabled={busy === "appointments"}
                onClick={() => void download("appointments", "appointments.xlsx")}
              >
                <Download className="size-4" />
                {busy === "appointments" ? "Preparing…" : "Download Excel"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {can("tasks.view") && isModuleEnabled("tasks") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <CheckSquare className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Today’s tasks</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Work allotment for today ({todayKey}). Filter further on the
                    Tasks page.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-auto w-full"
                disabled={busy === "tasks"}
                onClick={() =>
                  void download(
                    "tasks",
                    "tasks.xlsx",
                    `workDate=${encodeURIComponent(todayKey)}`
                  )
                }
              >
                <Download className="size-4" />
                {busy === "tasks" ? "Preparing…" : "Download Excel"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {can("dak.view") && isModuleEnabled("dak") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Dak register</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Full postal / courier book. Filtered export stays on Dak.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-auto w-full"
                disabled={busy === "dak"}
                onClick={() => void download("dak", "dak.xlsx")}
              >
                <Download className="size-4" />
                {busy === "dak" ? "Preparing…" : "Download Excel"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {can("accounts.view") && isModuleEnabled("accounts") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <CircleDollarSign className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Accounts audit pack</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Unfiltered cash register. For date/client filters, export
                    from Accounts.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-auto w-full"
                disabled={busy === "accounts"}
                onClick={() => void download("accounts", "accounts-audit.xlsx")}
              >
                <Download className="size-4" />
                {busy === "accounts" ? "Preparing…" : "Download Excel"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {can("accounts.view") && can("reports.view") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <CircleDollarSign className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Fees outstanding</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Agreed vs collected per case with balance due.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-auto w-full"
                disabled={busy === "fees-outstanding"}
                onClick={() =>
                  void download("fees-outstanding", "fees-outstanding.xlsx")
                }
              >
                <Download className="size-4" />
                {busy === "fees-outstanding" ? "Preparing…" : "Download Excel"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isModuleEnabled("cases") && can("cases.view") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Printer className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Printable day board</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Open today’s board and use Print day for the cause list.
                  </p>
                </div>
              </div>
              <Button asChild type="button" variant="outline" className="mt-auto w-full">
                <Link href="/diary">
                  <CalendarDays className="size-4" />
                  Open day board
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isModuleEnabled("hrms") && can("hrms.view") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Office presence</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Attendance and leave live on the HRMS board.
                  </p>
                </div>
              </div>
              <Button asChild type="button" variant="outline" className="mt-auto w-full">
                <Link href="/hrms">
                  <Users className="size-4" />
                  Open HRMS
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
