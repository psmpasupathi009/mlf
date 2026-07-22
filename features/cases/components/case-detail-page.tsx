"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarPlus,
  MapPin,
  Pencil,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/data/page-header";
import { UnitIdBadge } from "@/shared/components/data/unit-id-badge";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import type {
  CaseSummary,
  HearingSummary,
} from "@/features/cases/server/serialize";
import type { ClientSummary } from "@/features/clients/server/serialize";
import type { DocumentSummary } from "@/features/documents/server/serialize";
import { CaseFormDialog } from "@/features/cases/components/case-form-dialog";
import { AddHearingDialog } from "@/features/cases/components/add-hearing-dialog";
import { AdjournHearingDialog } from "@/features/cases/components/adjourn-hearing-dialog";
import { UploadDocumentDialog } from "@/features/documents/components/upload-document-dialog";
import { CaseDocumentsPanel } from "@/features/documents/components/case-documents-panel";
import type { DocumentTypeValue } from "@/lib/validations/documents.schema";

type DetailResponse = {
  case: CaseSummary;
  client: ClientSummary | null;
  hearings: HearingSummary[];
  documents: DocumentSummary[];
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

export function CaseDetailPage({
  user,
  unitId,
}: {
  user: PublicUser;
  unitId: string;
}) {
  const can = (module: string, action: string) =>
    user.permissions.includes(`${module}.${action}`);

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [hearingOpen, setHearingOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<DocumentTypeValue>("other");
  const [adjourning, setAdjourning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch<DetailResponse>(
      `/api/v1/cases/${unitId}`
    );
    setLoading(false);
    if (!ok) {
      toast.error(
        getErrorMessage(data as Record<string, unknown>, "Failed to load case")
      );
      return;
    }
    setDetail(data as unknown as DetailResponse);
  }, [unitId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  if (loading && !detail) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!detail) {
    return (
      <EmptyState
        title="Case not found"
        description="It may have been removed."
        action={
          <Button asChild variant="outline">
            <Link href="/cases">Back to cases</Link>
          </Button>
        }
      />
    );
  }

  const { case: item, client, hearings, documents } = detail;

  function openUpload(docType: DocumentTypeValue = "other") {
    setUploadType(docType);
    setUploadOpen(true);
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild type="button" variant="ghost" size="sm" className="-ml-2">
          <Link href="/cases">
            <ArrowLeft className="size-4" />
            Cases
          </Link>
        </Button>
      </div>

      <PageHeader
        title={item.caseNumber ?? item.unitId}
        description={
          client
            ? `${client.name} · +${client.mobile}`
            : "Case file and case documents"
        }
        actions={
          <>
            <UnitIdBadge value={item.unitId} />
            <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>
              {item.status}
            </Badge>
            {can("cases", "edit") ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Court
            </p>
            <p className="mt-2 flex items-start gap-2 text-sm font-medium text-navy">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                {item.courtName ?? "—"}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {[item.city, item.district, item.state]
                    .filter(Boolean)
                    .join(", ") || "Location not set"}
                </span>
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Next hearing
            </p>
            <p className="mt-2 text-sm font-medium text-navy">
              {item.nextHearingAt
                ? new Date(item.nextHearingAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Court case no.
            </p>
            <p className="mt-2 text-sm font-medium text-navy">
              {item.caseNumber ?? (
                <span className="text-amber-700">Not allotted yet</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Agreed fee
            </p>
            <p className="mt-2 text-sm font-medium text-navy">
              {item.agreedFee != null
                ? `₹${item.agreedFee.toLocaleString("en-IN")}`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Documents first — judgments/orders are primary office need */}
      <CaseDocumentsPanel
        documents={documents}
        canUpload={can("cases", "upload")}
        onUploadClick={openUpload}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-navy">Hearings</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Diary dates and SMS status
            </p>
          </div>
          {can("cases", "edit") ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setHearingOpen(true)}
            >
              <CalendarPlus className="size-4" />
              Add hearing
            </Button>
          ) : null}
        </div>
        <CardContent className="p-0 pt-0">
          {hearings.length === 0 ? (
            <p className="px-5 py-10 text-sm text-muted-foreground">
              No hearings recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>SMS</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hearings.map((h) => (
                  <TableRow key={h.unitId}>
                    <TableCell>
                      {new Date(h.hearingDate).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>{h.purpose ?? "—"}</TableCell>
                    <TableCell>
                      {h.outcome ?? (h.isAdjourned ? "Adjourned" : "—")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={h.smsSentAt ? "success" : "muted"}>
                        {h.smsSentAt ? "Sent" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {can("cases", "edit") && !h.isAdjourned ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAdjourning(h.unitId)}
                        >
                          Adjourn
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {can("accounts", "view") ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-muted p-2.5 text-navy">
                <Wallet className="size-4" />
              </span>
              <div>
                <p className="font-medium text-navy">Cash linked to this case</p>
                <p className="text-sm text-muted-foreground">
                  Advances and fee payments for {item.unitId}
                </p>
              </div>
            </div>
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={`/accounts?caseUnitId=${item.unitId}`}>
                Open accounts
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <CaseFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        caseItem={{ ...item, clientName: client?.name ?? null }}
        onSaved={load}
      />
      <AddHearingDialog
        open={hearingOpen}
        onOpenChange={setHearingOpen}
        caseUnitId={item.unitId}
        onSaved={load}
      />
      {adjourning ? (
        <AdjournHearingDialog
          open={Boolean(adjourning)}
          onOpenChange={(v) => !v && setAdjourning(null)}
          hearingUnitId={adjourning}
          onSaved={load}
        />
      ) : null}
      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        caseUnitId={item.unitId}
        clientUnitId={client?.unitId}
        defaultDocType={uploadType}
        onUploaded={load}
      />
    </section>
  );
}
