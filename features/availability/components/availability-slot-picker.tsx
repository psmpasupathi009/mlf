"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import {
  formatDisplayDate,
  OfficeDayPicker,
  parseDateKey,
  toDateKey,
} from "@/shared/components/forms/office-day-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type DayAvailability = {
  date: string;
  durationMin: number;
  onLeave: boolean;
  windows: { start: string; end: string }[];
  freeSlots: string[];
  busy: { start: string; end: string; reason: string; label?: string }[];
};

function formatTimeLabel(hhmm: string): string {
  const [hStr, m] = hhmm.split(":");
  let h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function combine(dateKey: string, time: string): string {
  return `${dateKey}T${time}`;
}

function parseValue(value: string): { dateKey: string; time: string } | null {
  if (!value || !value.includes("T")) return null;
  const [dateKey, timePart] = value.split("T");
  return { dateKey, time: timePart.slice(0, 5) };
}

export function AvailabilitySlotPicker({
  advocateMobile,
  durationMin,
  clientUnitId,
  excludeAppointmentUnitId,
  value,
  onChange,
  disabled,
}: {
  advocateMobile: string;
  durationMin: number;
  clientUnitId?: string;
  excludeAppointmentUnitId?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const parsed = parseValue(value);
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [dateKey, setDateKey] = useState(
    () => parsed?.dateKey ?? toDateKey(today)
  );
  const [avail, setAvail] = useState<DayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!advocateMobile || disabled) {
      queueMicrotask(() => setAvail(null));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({
          advocateMobile,
          date: dateKey,
          durationMin: String(durationMin),
        });
        if (clientUnitId) params.set("clientUnitId", clientUnitId);
        if (excludeAppointmentUnitId) {
          params.set("excludeAppointmentUnitId", excludeAppointmentUnitId);
        }
        const { ok, data } = await apiFetch<DayAvailability>(
          `/api/v1/appointments/availability?${params.toString()}`
        );
        if (cancelled) return;
        setLoading(false);
        if (!ok) {
          setAvail(null);
          setError("Could not load free slots");
          return;
        }
        const day = data as unknown as DayAvailability;
        setAvail(day);
        if (parsed?.dateKey === dateKey && parsed.time) {
          if (!day.freeSlots.includes(parsed.time)) {
            onChange("");
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid fetch loops
  }, [advocateMobile, dateKey, durationMin, clientUnitId, excludeAppointmentUnitId, disabled]);

  const selected = parseDateKey(dateKey);
  const selectedTime = parsed?.dateKey === dateKey ? parsed.time : "";

  if (!advocateMobile) {
    return (
      <p className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        Select an advocate to see free times.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", disabled && "pointer-events-none opacity-60")}>
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-navy" />
        <div className="min-w-0">
          <p className="font-medium text-navy">
            {selected && selectedTime
              ? `${formatDisplayDate(selected)} · ${formatTimeLabel(selectedTime)}`
              : selected
                ? `${formatDisplayDate(selected)} · pick a free slot`
                : "Pick a free date and time"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only open slots for this advocate ({durationMin} min)
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDateKey(toDateKey(today))}
        >
          Today
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDateKey(toDateKey(addDays(today, 1)))}
        >
          Tomorrow
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem]">
        <OfficeDayPicker
          selected={selected}
          onSelect={(d) => {
            if (!d) return;
            const next = toDateKey(d);
            setDateKey(next);
            onChange("");
          }}
          disabled={{ before: today }}
        />

        <div className="flex max-h-72 flex-col rounded-lg border border-border/80 bg-white">
          <p className="shrink-0 border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
            Free slots
          </p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
            {loading ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">Loading…</p>
            ) : error ? (
              <p className="px-1 py-2 text-xs text-destructive">{error}</p>
            ) : avail?.onLeave ? (
              <p className="px-1 py-2 text-xs text-amber-800">
                Advocate on approved leave
              </p>
            ) : !avail?.freeSlots.length ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                No free slots this day
              </p>
            ) : (
              avail.freeSlots.map((slot) => {
                const active = selectedTime === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => onChange(combine(dateKey, slot))}
                    className={cn(
                      "flex w-full items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-navy text-white"
                        : "text-navy hover:bg-muted"
                    )}
                  >
                    {formatTimeLabel(slot)}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
