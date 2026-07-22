"use client";

import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils/cn";
import "react-day-picker/style.css";

export function calendarClassNames(compact = false) {
  return {
    root: cn("w-full", compact ? "text-sm" : ""),
    months: "relative flex w-full flex-col",
    month: "w-full",
    month_caption: "mb-3 flex items-center justify-center",
    caption_label: "text-sm font-semibold text-navy",
    nav: "absolute inset-x-0 top-0 flex items-center justify-between px-1",
    button_previous:
      "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-navy",
    button_next:
      "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-navy",
    month_grid: "w-full border-collapse",
    weekdays: "flex w-full",
    weekday:
      "w-[14.28%] pb-2 text-center text-[11px] font-medium text-muted-foreground",
    week: "mt-0.5 flex w-full",
    day: "relative w-[14.28%] p-0.5 text-center",
    day_button: cn(
      "mx-auto flex size-9 items-center justify-center rounded-full text-sm transition-colors",
      "hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/30"
    ),
    selected:
      "[&>button]:bg-navy [&>button]:text-white [&>button]:hover:bg-navy [&>button]:hover:text-white",
    today: "[&>button]:font-semibold [&>button]:text-navy [&>button]:ring-1 [&>button]:ring-gold/60",
    outside: "[&>button]:text-muted-foreground/40",
    disabled: "[&>button]:pointer-events-none [&>button]:opacity-35",
    hidden: "invisible",
  } as const;
}

export function OfficeDayPicker({
  selected,
  onSelect,
  disabled,
  className,
}: {
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  disabled?: Parameters<typeof DayPicker>[0]["disabled"];
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border/80 bg-white p-2 sm:p-3", className)}>
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={onSelect}
        disabled={disabled}
        showOutsideDays
        classNames={calendarClassNames()}
      />
    </div>
  );
}

export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
