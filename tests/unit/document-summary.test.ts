import { describe, expect, it } from "vitest";
import { toDocumentSummary } from "@/features/documents/server/serialize";
import type { Document } from "@prisma/client";

function fakeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "obj1",
    unitId: "DOC-1",
    title: "Vakalatnama",
    docType: "vakalatnama",
    notes: "Signed",
    caseId: "case1",
    caseUnitId: "CASE-1",
    clientId: null,
    clientUnitId: null,
    mimeType: "application/pdf",
    size: 2048,
    fileKey: "docs/a.pdf",
    originalName: "vakalat.pdf",
    uploadedById: "user1",
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  };
}

describe("toDocumentSummary", () => {
  it("maps all fields the case documents panel expects", () => {
    const summary = toDocumentSummary(fakeDoc());
    expect(summary).toEqual({
      unitId: "DOC-1",
      title: "Vakalatnama",
      docType: "vakalatnama",
      docTypeLabel: "Vakalatnama",
      notes: "Signed",
      caseUnitId: "CASE-1",
      clientUnitId: null,
      mimeType: "application/pdf",
      size: 2048,
      originalName: "vakalat.pdf",
      createdAt: "2026-01-15T10:00:00.000Z",
    });
  });

  it("defaults missing docType to other", () => {
    const summary = toDocumentSummary(
      fakeDoc({ docType: undefined as unknown as Document["docType"] })
    );
    expect(summary.docType).toBe("other");
    expect(summary.docTypeLabel).toBe("Other");
  });

  it("nulls empty notes", () => {
    const summary = toDocumentSummary(fakeDoc({ notes: null }));
    expect(summary.notes).toBeNull();
  });
});
