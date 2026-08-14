import { compliance } from "@/config/company/compliance";

export function assertAllowedMime(mimeType: string): void {
  const allowed = compliance.uploads.allowedMimeTypes as readonly string[];
  if (!allowed.includes(mimeType)) {
    throw new Error(`File type not allowed: ${mimeType}`);
  }
}

export function assertSize(size: number): void {
  if (size > compliance.uploads.maxBytes) {
    throw new Error(
      `File too large (max ${Math.round(compliance.uploads.maxBytes / (1024 * 1024))} MB)`
    );
  }
}

export function safeFolder(folder: string): string {
  return (
    folder
      .replace(/[^a-zA-Z0-9_\-./]/g, "_")
      .replace(/\.\./g, "_")
      .slice(0, 80) || "misc"
  );
}
