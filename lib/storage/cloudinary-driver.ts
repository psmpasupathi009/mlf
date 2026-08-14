import { randomUUID } from "crypto";
import { detectAllowedMime } from "@/lib/storage/detect-mime";
import { assertAllowedMime, assertSize, safeFolder } from "@/lib/storage/guards";
import type { StorageDriver, StoredFile } from "@/lib/storage/types";
import {
  cloudinaryFolderRoot,
  destroyAsset,
  downloadBuffer,
  uploadBuffer,
  type CloudinaryResourceType,
} from "@/lib/cloudinary";

export type CloudinaryStorageKey = {
  resourceType: CloudinaryResourceType;
  publicId: string;
};

export function parseStorageKey(
  key: string
): { kind: "cloudinary"; resourceType: CloudinaryResourceType; publicId: string } | {
  kind: "local";
  path: string;
} {
  if (key.startsWith("image:")) {
    return { kind: "cloudinary", resourceType: "image", publicId: key.slice("image:".length) };
  }
  if (key.startsWith("raw:")) {
    return { kind: "cloudinary", resourceType: "raw", publicId: key.slice("raw:".length) };
  }
  return { kind: "local", path: key };
}

export function formatStorageKey(
  resourceType: CloudinaryResourceType,
  publicId: string
): string {
  return `${resourceType}:${publicId}`;
}

function resourceTypeForMime(mimeType: string): CloudinaryResourceType {
  return mimeType === "application/pdf" ? "raw" : "image";
}

export const cloudinaryDriver: StorageDriver = {
  async put({ buffer, originalName, folder = "misc" }): Promise<StoredFile> {
    assertSize(buffer.byteLength);
    const sniffed = detectAllowedMime(buffer);
    if (!sniffed) {
      throw new Error("File type not allowed (only PDF, JPEG, PNG, WebP)");
    }
    assertAllowedMime(sniffed);

    const resourceType = resourceTypeForMime(sniffed);
    const root = cloudinaryFolderRoot();
    const destFolder = `${root}/${safeFolder(folder)}`;
    const safeName = originalName.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
    const filename = `${randomUUID()}-${safeName}`;

    const uploaded = await uploadBuffer({
      buffer,
      folder: destFolder,
      filename,
      resourceType,
    });

    return {
      key: formatStorageKey(uploaded.resourceType, uploaded.publicId),
      mimeType: sniffed,
      size: uploaded.bytes,
      originalName,
    };
  },

  async get(key) {
    const parsed = parseStorageKey(key);
    if (parsed.kind !== "cloudinary") return null;
    const buffer = await downloadBuffer(parsed.publicId, parsed.resourceType);
    if (!buffer) return null;
    return { buffer };
  },

  async delete(key) {
    const parsed = parseStorageKey(key);
    if (parsed.kind !== "cloudinary") return;
    await destroyAsset(parsed.publicId, parsed.resourceType);
  },
};
