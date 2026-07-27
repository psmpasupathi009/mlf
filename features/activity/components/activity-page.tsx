"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/shared/components/data/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/shared/components/forms/date-picker";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Skeleton } from "@/shared/components/feedback/skeleton";
import { apiFetch, getErrorMessage } from "@/lib/api/client";
import { formatIstTime, istDisplayDate } from "@/lib/utils/ist";
import {
  ENTITY_OPTIONS,
  actionLabel,
  entityHref,
} from "@/features/activity/lib/action-labels";

type ActivityRow = {
  id: string;
  action: string;
  entity: string;
  entityUnitId: string | null;
  actorUnitId: string | null;
  actorName: string | null;
  meta: unknown;
  createdAt: string;
};

type ActivityListResponse = {
  data: ActivityRow[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return `${istDisplayDate(d)} · ${formatIstTime(d)}`;
}

function actorLabel(row: ActivityRow) {
  if (!row.actorUnitId) return "System";
  if (row.actorName) return `${row.actorName} (${row.actorUnitId})`;
  return row.actorUnitId;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function ChangesPanel({ meta }: { meta: unknown }) {
  if (!isRecord(meta)) {
    return (
      <p className="text-xs text-muted-foreground">No field detail recorded.</p>
    );
  }

  const changes = isRecord(meta.changes) ? meta.changes : null;
  const before = isRecord(meta.before) ? meta.before : null;
  const after = isRecord(meta.after) ? meta.after : null;

  if (changes && Object.keys(changes).length > 0) {
    return (
      <ul className="space-y-1.5">
        {Object.entries(changes).map(([field, raw]) => {
          const pair = isRecord(raw) ? raw : null;
          return (
            <li
              key={field}
              className="grid gap-0.5 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs sm:grid-cols-[8rem_1fr]"
            >
              <span className="font-medium text-navy">{field}</span>
              <span className="break-all text-muted-foreground">
                <span className="text-foreground/80">
                  {formatValue(pair?.from)}
                </span>
                <span className="mx-1.5 text-border">→</span>
                <span className="text-foreground">{formatValue(pair?.to)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  if (after && !before) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-navy">Created</p>
        <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
          {JSON.stringify(after, null, 2)}
        </pre>
      </div>
    );
  }

  if (before && !after) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-navy">Deleted / removed</p>
        <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
          {JSON.stringify(before, null, 2)}
        </pre>
      </div>
    );
  }

  if (before || after) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-navy">Before</p>
          <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            {JSON.stringify(before ?? {}, null, 2)}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-navy">After</p>
          <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            {JSON.stringify(after ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  const rest = { ...meta };
  delete rest.before;
  delete rest.after;
  delete rest.changes;
  if (Object.keys(rest).length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No field detail recorded.</p>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
      {JSON.stringify(rest, null, 2)}
    </pre>
  );
}

export function ActivityPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entity, setEntity] = useState<string>("all");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");

  const buildQuery = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", "40");
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (entity && entity !== "all") params.set("entity", entity);
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      return params.toString();
    },
    [from, to, entity, q]
  );

  const load = useCallback(
    async (mode: "replace" | "append", cursor?: string | null) => {
      if (mode === "replace") {
        setLoading(true);
        setError(null);
        setLoadMoreError(null);
      } else {
        setLoadingMore(true);
        setLoadMoreError(null);
      }
      const { ok, data } = await apiFetch(
        `/api/v1/activity?${buildQuery(mode === "append" ? cursor : null)}`
      );
      if (mode === "replace") setLoading(false);
      else setLoadingMore(false);

      if (!ok) {
        const message = getErrorMessage(
          data as Record<string, unknown>,
          "Failed to load activity"
        );
        if (mode === "append") setLoadMoreError(message);
        else setError(message);
        return;
      }
      const body = data as ActivityListResponse;
      setRows((prev) =>
        mode === "append" ? [...prev, ...body.data] : body.data
      );
      setNextCursor(body.meta.nextCursor);
      setHasMore(body.meta.hasMore);
    },
    [buildQuery]
  );

  useEffect(() => {
    void load("replace");
  }, [load]);

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Activity"
        description="Who changed what across the office — creates, edits, imports, and security actions."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>From</Label>
            <DatePicker value={from} onChange={setFrom} />
          </div>
          <div className="grid gap-1.5">
            <Label>To</Label>
            <DatePicker value={to} onChange={setTo} />
          </div>
          <div className="grid gap-1.5">
            <Label>Entity</Label>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger>
                <SelectValue placeholder="All entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {ENTITY_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Search</Label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setQ(qDraft.trim());
              }}
            >
              <Input
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                placeholder="Action, id, person…"
              />
              <Button type="submit" variant="outline">
                Go
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-5" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : error && rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-destructive">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              compact
              title="No activity yet"
              description="Creates, edits, imports, and security actions will show here."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {rows.map((row) => {
                const open = Boolean(expanded[row.id]);
                const href = entityHref(row.entity, row.entityUnitId, row.meta);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30"
                    >
                      <span className="mt-0.5 text-muted-foreground">
                        {open ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-navy">
                            {actionLabel(row.action)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {row.entity}
                            {row.entityUnitId ? ` · ${row.entityUnitId}` : ""}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            {actorLabel(row)}
                          </span>
                          <span className="mx-1.5 text-border">·</span>
                          {formatWhen(row.createdAt)}
                        </p>
                      </div>
                    </button>
                    {open ? (
                      <div className="space-y-3 border-t border-border/50 bg-muted/15 px-4 py-3 pl-11">
                        {href ? (
                          <Link
                            href={href}
                            className="text-xs font-medium text-brand underline-offset-2 hover:underline"
                          >
                            Open related page
                          </Link>
                        ) : null}
                        <ChangesPanel meta={row.meta} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {hasMore ? (
            <div className="space-y-2 border-t border-border/70 p-4">
              {loadMoreError ? (
                <p className="text-center text-xs text-destructive">
                  {loadMoreError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loadingMore}
                onClick={() => void load("append", nextCursor)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
