import type { Document, User } from "@prisma/client";
import { hasPermission } from "@/lib/rbac";
import { isModuleEnabled } from "@/config/company/modules";

/** View/download: expense bills need expenses.*; fee receipts need accounts.*; other docs need cases.view. */
export async function canViewDocument(
  user: User,
  doc: Pick<Document, "docType" | "expenseUnitId">
): Promise<boolean> {
  if (doc.expenseUnitId) {
    if (!isModuleEnabled("expenses")) return false;
    return (
      (await hasPermission(user.id, "expenses", "view")) ||
      (await hasPermission(user.id, "expenses", "edit")) ||
      (await hasPermission(user.id, "expenses", "upload"))
    );
  }
  if (doc.docType === "receipt") {
    if (!isModuleEnabled("accounts")) return false;
    return (
      (await hasPermission(user.id, "accounts", "view")) ||
      (await hasPermission(user.id, "accounts", "edit")) ||
      (await hasPermission(user.id, "accounts", "upload"))
    );
  }
  if (!isModuleEnabled("cases")) return false;
  return hasPermission(user.id, "cases", "view");
}

/** Delete/upload-style mutate: cases.upload, expenses edit/upload for expense bills, or accounts edit/upload for fee receipts. */
export async function canMutateDocument(
  user: User,
  doc: Pick<Document, "docType" | "expenseUnitId">
): Promise<boolean> {
  if (
    isModuleEnabled("cases") &&
    (await hasPermission(user.id, "cases", "upload"))
  ) {
    return true;
  }
  if (doc.expenseUnitId) {
    if (!isModuleEnabled("expenses")) return false;
    return (
      (await hasPermission(user.id, "expenses", "edit")) ||
      (await hasPermission(user.id, "expenses", "upload"))
    );
  }
  if (doc.docType !== "receipt" || !isModuleEnabled("accounts")) return false;
  return (
    (await hasPermission(user.id, "accounts", "edit")) ||
    (await hasPermission(user.id, "accounts", "upload"))
  );
}

/** Safe Content-Disposition for downloads (ASCII fallback + RFC 5987). */
export function contentDispositionAttachment(originalName: string): string {
  const ascii = originalName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(originalName).replace(
    /['()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii || "download"}"; filename*=UTF-8''${encoded}`;
}
