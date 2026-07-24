"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import { PageHeader } from "@/shared/components/data/page-header";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/shared/components/forms/date-picker";
import { AdvocatePicker } from "@/features/employees/components/advocate-picker";
import { AdjournHearingDialog } from "@/features/cases/components/adjourn-hearing-dialog";
import {
  DiaryHearingCard,
  type DiaryItem,
} from "@/features/diary/components/diary-hearing-card";
import type { PublicUser } from "@/lib/auth/session";
import { displayMobile } from "@/lib/auth/mobile";
import { canBookForAnyAdvocate } from "@/lib/appointments/booking-rules";
import {
  istAddCalendarDays,
  istDateKey,
  istDisplayDate,
  istDisplayWeekday,
} from "@/lib/utils/ist";
import { cn } from "@/lib/utils/cn";

type DiaryResponse = {
  date: string;
  items: DiaryItem[];
  meta: { truncated: boolean; limit: number };
};

function courtLabel(name: string | null) {
  return name?.trim() || "Court TBD";
}

export function DiaryPage({ user }: { user: PublicUser }) {
  const canEdit = user.permissions.includes("cases.edit");
  const bookAny = canBookForAnyAdvocate(user.roles);
  const todayKey = istDateKey();

  const [date, setDate] = useState(todayKey);
  const [items, setItems] = useState<DiaryItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [advocateFilter, setAdvocateFilter] = useState<string | null>(
    bookAny ? null : displayMobile(user.mobile)
  );
  const [advocateFilterLabel, setAdvocateFilterLabel] = useState<string | null>(
    bookAny ? null : user.name ?? displayMobile(user.mobile)
  );
  const [adjourning, setAdjourning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams({ date });
      if (advocateFilter) params.set("advocateMobile", advocateFilter);
      const res = await apiFetch<DiaryResponse>(
        `/api/v1/diary?${params.toString()}`
      );
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        toast.error(
          getErrorMessage(
            res.data as Record<string, unknown>,
            "Failed to load diary"
          )
        );
        setItems([]);
        setTruncated(false);
        return;
      }
      setItems(res.data.items ?? []);
      setTruncated(Boolean(res.data.meta?.truncated));
    })();
    return () => {
      cancelled = true;
    };
  }, [date, advocateFilter]);

  const reload = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (advocateFilter) params.set("advocateMobile", advocateFilter);
    const res = await apiFetch<DiaryResponse>(
      `/api/v1/diary?${params.toString()}`
    );
    setLoading(false);
    if (!res.ok) {
      toast.error(
        getErrorMessage(
          res.data as Record<string, unknown>,
          "Failed to load diary"
        )
      );
      return;
    }
    setItems(res.data.items ?? []);
    setTruncated(Boolean(res.data.meta?.truncated));
  }, [date, advocateFilter]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [
        item.caseNumber,
        item.caseUnitId,
        item.clientName,
        item.courtName,
        item.purpose,
        item.stage,
        item.advocateName,
        item.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const groups = useMemo(() => {
    const map = new Map<string, DiaryItem[]>();
    for (const item of filtered) {
      const key = courtLabel(item.courtName);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a.toLocaleLowerCase("en").localeCompare(b.toLocaleLowerCase("en"))
    );
  }, [filtered]);

  const courtCount = useMemo(
    () => new Set(items.map((i) => courtLabel(i.courtName))).size,
    [items]
  );
  const smsPending = useMemo(
    () => items.filter((i) => !i.smsSentAt).length,
    [items]
  );

  const isToday = date === todayKey;
  const dateObj = new Date(`${date}T12:00:00+05:30`);
  const weekday = istDisplayWeekday(dateObj);
  const displayDate = istDisplayDate(dateObj);

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <PageHeader
          title="Advocate diary"
          description="Court cause list (IST) — board by court for the selected day."
          actions={
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2"
              onClick={() => window.print()}
              disabled={loading || items.length === 0}
            >
              <Printer className="size-4" />
              Print day
            </Button>
          }
        />
      </div>

      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-semibold text-navy">Advocate diary</h1>
        <p className="text-sm text-muted-foreground">
          {weekday}, {displayDate} · Court cause list
        </p>
      </div>

      <div className="rounded-2xl border border-border/80 bg-white p-3 shadow-sm print:hidden sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Previous day"
              onClick={() => setDate((d) => istAddCalendarDays(d, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => setDate(todayKey)}
              className={cn(
                "shrink-0 rounded-xl px-3.5 py-2 text-left transition-colors",
                isToday
                  ? "bg-navy text-white shadow-sm"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-navy"
              )}
            >
              <span className="block text-sm font-semibold">Today</span>
              <span
                className={cn(
                  "block text-[11px]",
                  isToday ? "text-white/70" : "text-muted-foreground"
                )}
              >
                IST
              </span>
            </button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Next day"
              onClick={() => setDate((d) => istAddCalendarDays(d, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search case, client, court…"
                className="h-11 pl-9"
              />
            </div>
            {bookAny ? (
              <AdvocatePicker
                className="h-11 w-full sm:w-52"
                value={advocateFilter}
                selectedLabel={advocateFilterLabel}
                onChange={(a) => {
                  if (!a) {
                    setAdvocateFilter(null);
                    setAdvocateFilterLabel(null);
                    return;
                  }
                  setAdvocateFilter(displayMobile(a.mobile));
                  setAdvocateFilterLabel(a.displayName || a.name || a.mobile);
                }}
                valueBy="mobile"
                placeholder="All advocates"
                clearable
                clearLabel="All advocates"
              />
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-navy">{weekday}</span>
            <span> · {displayDate}</span>
          </p>
          {!loading ? (
            <>
              <span>
                {items.length} hearing{items.length === 1 ? "" : "s"}
              </span>
              <span>
                {courtCount} court{courtCount === 1 ? "" : "s"}
              </span>
              <span>
                {smsPending} SMS pending
              </span>
              {search.trim() && filtered.length !== items.length ? (
                <span>
                  Showing {filtered.length} match
                  {filtered.length === 1 ? "" : "es"}
                </span>
              ) : null}
            </>
          ) : (
            <span>Loading…</span>
          )}
        </div>
      </div>

      {truncated ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          Showing the first 100 hearings for this day. Narrow by advocate or
          open Cases for the full register.
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3 print:hidden">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-border/60 bg-muted/40"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No hearings this day"
          description="Pick another date or add a hearing on a case."
          action={
            <Button asChild type="button" variant="outline">
              <Link href="/cases">Open cases</Link>
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try a different search or clear the advocate filter."
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([court, groupItems]) => (
            <section key={court} className="space-y-3">
              <div className="flex items-baseline justify-between gap-2 border-b border-border/70 pb-2">
                <h2 className="text-sm font-semibold tracking-wide text-navy uppercase">
                  {court}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {groupItems.length} matter
                  {groupItems.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="space-y-3">
                {groupItems.map((item) => (
                  <DiaryHearingCard
                    key={item.hearingUnitId}
                    item={item}
                    canEdit={canEdit}
                    onAdjourn={() => setAdjourning(item.hearingUnitId)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {adjourning ? (
        <AdjournHearingDialog
          open={Boolean(adjourning)}
          onOpenChange={(open) => {
            if (!open) setAdjourning(null);
          }}
          hearingUnitId={adjourning}
          onSaved={() => {
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}
