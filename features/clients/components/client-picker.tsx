"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";
import { ClientFormDialog } from "@/features/clients/components/client-form-dialog";
import type { ClientSummary } from "@/features/clients/server/serialize";

type ListResponse = { data: ClientSummary[] };

export function ClientPicker({
  value,
  onChange,
  label = "Client",
}: {
  value: { unitId: string; name: string } | null;
  onChange: (client: { unitId: string; name: string } | null) => void;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!query.trim() || value) {
      const clearTimer = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(clearTimer);
    }
    const timer = setTimeout(async () => {
      const { ok, data } = await apiFetch<ListResponse>(
        `/api/v1/clients?q=${encodeURIComponent(query)}&pageSize=8`
      );
      if (ok) setResults((data as unknown as ListResponse).data ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, value]);

  if (value) {
    return (
      <div className="grid gap-2">
        <Label>{label}</Label>
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            <span className="font-medium text-navy">{value.name}</span>{" "}
            <span className="text-muted-foreground">({value.unitId})</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onChange(null)}
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Search client by name or mobile…"
        />
        {open && (results.length > 0 || query.trim()) ? (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-white shadow-md">
            {results.map((c) => (
              <button
                key={c.unitId}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange({ unitId: c.unitId, name: c.name });
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="font-medium text-navy">{c.name}</span>{" "}
                <span className="text-muted-foreground">· +91 {c.mobile} · {c.unitId}</span>
              </button>
            ))}
            <button
              type="button"
              className="block w-full border-t border-border px-3 py-2 text-left text-sm font-medium text-navy hover:bg-muted"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
            >
              + Add new client
            </button>
          </div>
        ) : null}
      </div>

      <ClientFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        client={null}
        onSaved={(client) => onChange({ unitId: client.unitId, name: client.name })}
      />
    </div>
  );
}
