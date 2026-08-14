import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { detectAllowedMime } from "@/lib/storage/detect-mime";
import { assertAllowedMime, assertSize, safeFolder } from "@/lib/storage/guards";
import { cloudinaryDriver, parseStorageKey } from "@/lib/storage/cloudinary-driver";
import type { StorageDriver, StoredFile } from "@/lib/storage/types";

export type { StoredFile, StorageDriver } from "@/lib/storage/types";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

const localDriver: StorageDriver = {
  async put({ buffer, originalName, folder = "misc" }) {
    assertSize(buffer.byteLength);

    const sniffed = detectAllowedMime(buffer);
    if (!sniffed) {
      throw new Error("File type not allowed (only PDF, JPEG, PNG, WebP)");
    }
    assertAllowedMime(sniffed);

    const safeName = originalName.replace(/[^\w.\-]+/g, "_").slice(0, 80);
    const key = `${safeFolder(folder)}/${randomUUID()}-${safeName}`;
    const fullPath = path.join(UPLOAD_ROOT, key);
    if (!fullPath.startsWith(UPLOAD_ROOT + path.sep) && fullPath !== UPLOAD_ROOT) {
      throw new Error("Invalid upload path");
    }
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);

    return {
      key,
      mimeType: sniffed,
      size: buffer.byteLength,
      originalName,
    };
  },

  async get(key) {
    try {
      const fullPath = path.join(UPLOAD_ROOT, key);
      if (!fullPath.startsWith(UPLOAD_ROOT + path.sep)) return null;
      const buffer = await readFile(fullPath);
      return { buffer };
    } catch {
      return null;
    }
  },

  async delete(key) {
    try {
      const fullPath = path.join(UPLOAD_ROOT, key);
      if (!fullPath.startsWith(UPLOAD_ROOT + path.sep)) return;
      await unlink(fullPath);
    } catch {
      // ignore missing
    }
  },
};

/**
 * New uploads go to Cloudinary (private/authenticated).
 * get/delete: Cloudinary keys (`image:` / `raw:`) vs legacy local paths.
 */
export const storage: StorageDriver = {
  put(input) {
    return cloudinaryDriver.put(input);
  },
  async get(key) {
    const parsed = parseStorageKey(key);
    if (parsed.kind === "cloudinary") return cloudinaryDriver.get(key);
    return localDriver.get(key);
  },
  async delete(key) {
    const parsed = parseStorageKey(key);
    if (parsed.kind === "cloudinary") {
      await cloudinaryDriver.delete(key);
      return;
    }
    await localDriver.delete(key);
  },
};
