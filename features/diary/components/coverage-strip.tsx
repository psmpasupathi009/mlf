"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CoverageResolveDialog,
  type CoverageItemSummary,
} from "@/features/hearings/components/coverage-resolve-dialog";

type Props = {
  enabled: boolean;
};

export function CoverageStrip({ enabled }: Props) {
  const [items, setItems] = useState<CoverageItemSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<CoverageItemSummary | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    const { ok, data } = await apiFetch<{
      data?: CoverageItemSummary[];
      meta?: { total?: number };
    }>("/api/hearings/coverage?status=open&pageSize=8");
    if (!ok || !data) {
      setItems([]);
      setTotal(0);
      return;
    }
    const list = Array.isArray(data.data) ? data.data : [];
    setItems(list);
    setTotal(
      typeof data.meta?.total === "number" ? data.meta.total : list.length
    );
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled || total === 0) return null;

  return (
    <>
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 print:hidden">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Users className="size-4 text-amber-800" aria-hidden />
          <h2 className="text-sm font-semibold text-navy">
            Hearing coverage needed
          </h2>
          <Badge variant="warning">{total}</Badge>
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.unitId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-navy">{item.caseUnitId}</p>
                <p className="text-xs text-muted-foreground">
                  {item.hearingDateLabel} · {item.reason.replace(/_/g, " ")}
                  {item.reasonNote ? ` — ${item.reasonNote}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setSelected(item);
                  setOpen(true);
                }}
              >
                Resolve
              </Button>
            </li>
          ))}
        </ul>
        {total > items.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {items.length} of {total} open items.{" "}
            <Link
              href="/coverage"
              className="text-navy underline-offset-2 hover:underline"
            >
              Open Coverage
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            <Link
              href="/coverage"
              className="text-navy underline-offset-2 hover:underline"
            >
              Open Coverage page
            </Link>{" "}
            for cover / permanent reassign.
          </p>
        )}
      </section>

      <CoverageResolveDialog
        open={open}
        onOpenChange={setOpen}
        item={selected}
        onResolved={() => void load()}
      />
    </>
  );
}
