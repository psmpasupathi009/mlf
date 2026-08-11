"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/shared/components/data/page-header";
import {
  CoverageResolveDialog,
  type CoverageItemSummary,
} from "@/features/hearings/components/coverage-resolve-dialog";
import type { PublicUser } from "@/lib/auth/session";
import { displayMobile } from "@/lib/auth/mobile";

type StatusFilter = "open" | "covered" | "permanently_reassigned" | "all";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "covered", label: "Covered" },
  { id: "permanently_reassigned", label: "Reassigned" },
  { id: "all", label: "All" },
];

export function CoveragePage({ user }: { user: PublicUser }) {
  const canResolve =
    user.roles.includes("admin") || user.roles.includes("sub_admin");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [items, setItems] = useState<CoverageItemSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CoverageItemSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ pageSize: "50" });
    if (status !== "all") q.set("status", status);
    else q.set("status", "open"); // API requires status; for "all" fetch open then we need API support

    // Fetch open + recent resolved when "all"
    if (status === "all") {
      const [openRes, coveredRes, reassignedRes] = await Promise.all([
        apiFetch<{ data?: CoverageItemSummary[]; meta?: { total?: number } }>(
          "/api/hearings/coverage?status=open&pageSize=30"
        ),
        apiFetch<{ data?: CoverageItemSummary[] }>(
          "/api/hearings/coverage?status=covered&pageSize=20"
        ),
        apiFetch<{ data?: CoverageItemSummary[] }>(
          "/api/hearings/coverage?status=permanently_reassigned&pageSize=20"
        ),
      ]);
      const list = [
        ...(openRes.ok && Array.isArray(openRes.data?.data)
          ? openRes.data.data
          : []),
        ...(coveredRes.ok && Array.isArray(coveredRes.data?.data)
          ? coveredRes.data.data
          : []),
        ...(reassignedRes.ok && Array.isArray(reassignedRes.data?.data)
          ? reassignedRes.data.data
          : []),
      ];
      setItems(list);
      setTotal(list.length);
      setLoading(false);
      return;
    }

    const { ok, data } = await apiFetch<{
      data?: CoverageItemSummary[];
      meta?: { total?: number };
    }>(`/api/hearings/coverage?${q.toString()}`);
    if (!ok || !data) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const list = Array.isArray(data.data) ? data.data : [];
    setItems(list);
    setTotal(typeof data.meta?.total === "number" ? data.meta.total : list.length);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hearing coverage"
        description="Assign cover for a hearing date, or permanently reassign the case advocate. Opens when an advocate is on leave or marked unavailable."
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            size="sm"
            variant={status === tab.id ? "default" : "outline"}
            onClick={() => setStatus(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-medium text-navy">
            <Users className="size-4" aria-hidden />
            No {status === "open" ? "open " : ""}coverage items
          </div>
          <p>
            Coverage appears after you approve leave (HRMS) or block an
            advocate day (Availability) for someone with upcoming hearings.
            Then use <strong>Resolve</strong> → Cover or Permanent reassign.
          </p>
          <p className="mt-3">
            Also shown on{" "}
            <Link href="/diary" className="text-navy underline-offset-2 hover:underline">
              Day board
            </Link>{" "}
            when items are open.
          </p>
        </section>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.unitId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/cases/${item.caseUnitId}`}
                    className="font-medium text-navy hover:underline"
                  >
                    {item.caseUnitId}
                  </Link>
                  <Badge variant="outline">{item.status.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.hearingDateLabel} · {item.reason.replace(/_/g, " ")}
                  {item.reasonNote ? ` — ${item.reasonNote}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Original: {displayMobile(item.originalAdvocateMobile)}
                  {item.coveringMobile
                    ? ` · Cover: ${displayMobile(item.coveringMobile)}`
                    : ""}
                </p>
              </div>
              {canResolve && item.status === "open" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setSelected(item);
                    setDialogOpen(true);
                  }}
                >
                  Resolve
                </Button>
              ) : (
                <Link
                  href={`/diary?date=${item.hearingDate.slice(0, 10)}`}
                  className="text-sm text-navy hover:underline"
                >
                  Day board
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && total > items.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {items.length} of {total}
        </p>
      ) : null}

      <CoverageResolveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={selected}
        onResolved={() => void load()}
      />
    </div>
  );
}
