"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/shared/components/data/page-header";
import { UnitIdBadge } from "@/shared/components/data/unit-id-badge";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/shared/components/forms/date-picker";

type DiaryItem = {
  hearingUnitId: string;
  hearingDate: string;
  purpose: string | null;
  smsSentAt: string | null;
  caseUnitId: string;
  caseNumber: string | null;
  caseStatus: string | null;
  clientName: string | null;
  clientUnitId: string | null;
  courtName: string | null;
};

export function DiaryPage() {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<DiaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await apiFetch<{ date: string; items: DiaryItem[] }>(
        `/api/v1/diary?date=${date}`
      );
      if (!cancelled && res.ok) setItems(res.data.items);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <div>
      <PageHeader
        title="Advocate diary"
        description="Cause list for the selected day (IST)."
      />

      <div className="mb-5 max-w-sm">
        <DatePicker value={date} onChange={setDate} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No hearings this day"
          description="Pick another date or add a hearing on a case."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.hearingUnitId}
              className="rounded-lg border border-border bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-navy">
                    {item.caseNumber || item.caseUnitId}
                    {item.clientName ? ` · ${item.clientName}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.courtName ?? "Court TBD"}
                    {item.purpose ? ` · ${item.purpose}` : ""}
                  </p>
                </div>
                <UnitIdBadge value={item.caseUnitId} />
              </div>
              <div className="mt-3">
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={`/cases/${item.caseUnitId}`}>Open case</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
