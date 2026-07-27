"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/shared/components/forms/date-picker";
import type { AttendanceSummary } from "@/features/hrms/server/serialize";
import type { HistoryPeriod } from "@/features/hrms/lib/period";
import { cn } from "@/lib/utils/cn";
import {
  formatDayLabel,
  formatTime,
  LocationLink,
} from "@/features/hrms/components/hrms-page-helpers";

export type AttendanceHistorySectionProps = {
  history: AttendanceSummary[];
  historyTotal: number;
  historyLoading: boolean;
  historyPeriod: HistoryPeriod;
  customFrom: string;
  customTo: string;
  historyRange: { from: string; to: string } | null;
  onPeriodChange: (period: HistoryPeriod) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
};

export function AttendanceHistorySection({
  history,
  historyTotal,
  historyLoading,
  historyPeriod,
  customFrom,
  customTo,
  historyRange,
  onPeriodChange,
  onCustomFromChange,
  onCustomToChange,
}: AttendanceHistorySectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>My attendance history</CardTitle>
          <p className="text-xs text-muted-foreground">
            {historyTotal
              ? historyTotal > history.length
                ? `Showing ${history.length} of ${historyTotal} day(s)`
                : `${historyTotal} day(s)`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "month" as const, label: "This month" },
              { id: "30d" as const, label: "Last 30 days" },
              { id: "custom" as const, label: "Custom" },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPeriodChange(p.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                historyPeriod === p.id
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-navy"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {historyPeriod === "custom" ? (
          <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
            <div className="grid gap-1.5">
              <Label>From</Label>
              <DatePicker value={customFrom} onChange={onCustomFromChange} />
            </div>
            <div className="grid gap-1.5">
              <Label>To</Label>
              <DatePicker value={customTo} onChange={onCustomToChange} />
            </div>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {historyPeriod === "custom" && !historyRange ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">
            Pick a valid from / to range.
          </p>
        ) : historyLoading ? (
          <div className="space-y-2 px-5 pb-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No attendance in this range yet.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border/70 md:hidden">
              {history.map((row) => (
                <div key={row.unitId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy">
                        {formatDayLabel(row.date)}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {formatTime(row.checkInAt)}
                        <span className="mx-1.5 text-border">→</span>
                        {formatTime(row.checkOutAt)}
                      </p>
                      <div className="mt-1 space-y-0.5">
                        <LocationLink
                          lat={row.checkInLat}
                          lng={row.checkInLng}
                          label="In"
                        />
                        {row.checkOutAt ? (
                          <LocationLink
                            lat={row.checkOutLat}
                            lng={row.checkOutLng}
                            label="Out"
                          />
                        ) : null}
                      </div>
                      {row.notes ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {row.notes}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        row.checkOutAt
                          ? "outline"
                          : row.checkInAt
                            ? "success"
                            : "warning"
                      }
                      className="shrink-0 normal-case"
                    >
                      {row.checkOutAt
                        ? "Checked out"
                        : row.checkInAt
                          ? "Present"
                          : "—"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <Table containerClassName="hidden rounded-none border-0 border-t shadow-none md:block">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-44">Date</TableHead>
                  <TableHead className="w-28 text-right">
                    Check in
                  </TableHead>
                  <TableHead className="w-28 text-right">
                    Check out
                  </TableHead>
                  <TableHead className="hidden min-w-36 lg:table-cell">
                    Location
                  </TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.unitId}>
                    <TableCell>
                      <p className="font-medium text-navy">
                        {formatDayLabel(row.date)}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {row.date}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatTime(row.checkInAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatTime(row.checkOutAt)}
                    </TableCell>
                    <TableCell className="hidden space-y-0.5 lg:table-cell">
                      <LocationLink
                        lat={row.checkInLat}
                        lng={row.checkInLng}
                        label="In"
                      />
                      {row.checkOutAt ? (
                        <LocationLink
                          lat={row.checkOutLat}
                          lng={row.checkOutLng}
                          label="Out"
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-sm truncate text-muted-foreground">
                      {row.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
