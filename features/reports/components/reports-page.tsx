"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
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

type ReportsPageProps = {
  user: PublicUser;
};

export function ReportsPage({ user }: ReportsPageProps) {
  const can = (perm: string) => user.permissions.includes(perm);
  const [busy, setBusy] = useState<string | null>(null);

  async function download(type: string, filename: string) {
    setBusy(type);
    const result = await apiDownload(
      `/api/v1/exports?type=${encodeURIComponent(type)}`,
      filename
    );
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
        {can("cases.view") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Cases register</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Excel of matters — number, status, court, next hearing.
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

        {can("accounts.view") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <CircleDollarSign className="mt-0.5 size-5 text-navy" />
                <div>
                  <h2 className="font-semibold text-navy">Accounts audit pack</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Full cash register export with void trail.
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

        {can("accounts.view") ? (
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-5">
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
            <CardContent className="flex h-full flex-col gap-4 p-5">
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
            <CardContent className="flex h-full flex-col gap-4 p-5">
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
