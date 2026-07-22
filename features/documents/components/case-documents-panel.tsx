"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileText,
  Gavel,
  Scale,
  ScrollText,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DocumentSummary } from "@/features/documents/server/serialize";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentTypeValue,
} from "@/lib/validations/documents.schema";
import { cn } from "@/lib/utils/cn";

const TYPE_ICON: Record<
  DocumentTypeValue,
  React.ComponentType<{ className?: string }>
> = {
  judgment: Gavel,
  order: Scale,
  pleading: ScrollText,
  vakalatnama: FileText,
  petition: ScrollText,
  affidavit: FileText,
  evidence: FileText,
  id_proof: FileText,
  receipt: FileText,
  other: FileText,
};

const TYPE_BADGE: Record<
  DocumentTypeValue,
  "default" | "gold" | "warning" | "muted"
> = {
  judgment: "gold",
  order: "default",
  pleading: "warning",
  vakalatnama: "muted",
  petition: "warning",
  affidavit: "muted",
  evidence: "muted",
  id_proof: "muted",
  receipt: "muted",
  other: "muted",
};

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Image";
  return "File";
}

type CaseDocumentsPanelProps = {
  documents: DocumentSummary[];
  canUpload: boolean;
  onUploadClick: (docType?: DocumentTypeValue) => void;
};

export function CaseDocumentsPanel({
  documents,
  canUpload,
  onUploadClick,
}: CaseDocumentsPanelProps) {
  const [filter, setFilter] = useState<"all" | DocumentTypeValue>("all");

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: documents.length };
    for (const t of DOCUMENT_TYPES) map[t] = 0;
    for (const d of documents) map[d.docType] = (map[d.docType] ?? 0) + 1;
    return map;
  }, [documents]);

  const rows =
    filter === "all"
      ? documents
      : documents.filter((d) => d.docType === filter);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-navy">Case documents</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Vakalatnama, petition, judgment, order, evidence, ID — linked to this
            case
          </p>
        </div>
        {canUpload ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onUploadClick("judgment")}
            >
              <Gavel className="size-4" />
              Judgment
            </Button>
            <Button type="button" size="sm" onClick={() => onUploadClick()}>
              <Upload className="size-4" />
              Upload
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border/80 px-5 py-3">
        {(
          [
            ["all", "All"],
            ...DOCUMENT_TYPES.map((t) => [t, DOCUMENT_TYPE_LABELS[t]] as const),
          ] as const
        ).map(([key, label]) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-navy text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-navy"
              )}
            >
              {label}
              <span className={cn("ml-1.5", active ? "text-white/70" : "")}>
                {counts[key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <CardContent className="p-0">
        {documents.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-navy">
              No documents yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a judgment, order, pleading or other case file.
            </p>
            {canUpload ? (
              <Button
                type="button"
                className="mt-5"
                size="sm"
                onClick={() => onUploadClick()}
              >
                <Upload className="size-4" />
                Upload first document
              </Button>
            ) : null}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No {filter === "all" ? "" : DOCUMENT_TYPE_LABELS[filter].toLowerCase() + " "}
            documents in this filter.
          </p>
        ) : (
          <ul className="divide-y divide-border/80">
            {rows.map((d) => {
              const Icon = TYPE_ICON[d.docType] ?? FileText;
              return (
                <li
                  key={d.unitId}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef1f6] text-navy">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-navy">
                          {d.title}
                        </p>
                        <Badge variant={TYPE_BADGE[d.docType]}>
                          {d.docTypeLabel}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {d.unitId} · {fileKind(d.mimeType)} ·{" "}
                        {formatBytes(d.size)} ·{" "}
                        {new Date(d.createdAt).toLocaleDateString("en-IN")}
                      </p>
                      {d.notes ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {d.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button asChild type="button" variant="outline" size="sm">
                    <a href={`/api/v1/documents/${d.unitId}/download`}>
                      <Download className="size-4" />
                      Download
                    </a>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
