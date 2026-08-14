/**
 * Live Cloudinary + storage flow check (does not write to Mongo).
 *   npx tsx scripts/verify-cloudinary-storage.ts
 */
import "dotenv/config";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { storage } from "../lib/storage";
import { parseStorageKey } from "../lib/storage/cloudinary-driver";
import { assertEnv } from "../lib/env";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const MINI_PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
);

async function roundTrip(
  label: string,
  buffer: Buffer,
  originalName: string,
  folder: string,
  expectType: "image" | "raw"
) {
  const stored = await storage.put({
    buffer,
    mimeType: "application/octet-stream",
    originalName,
    folder,
  });
  const parsed = parseStorageKey(stored.key);
  if (parsed.kind !== "cloudinary") {
    throw new Error(`${label}: expected Cloudinary key, got ${stored.key}`);
  }
  if (parsed.resourceType !== expectType) {
    throw new Error(
      `${label}: expected ${expectType} key, got ${parsed.resourceType}`
    );
  }
  if (!stored.key.includes(`mlf/${folder}`)) {
    throw new Error(`${label}: folder missing in key ${stored.key}`);
  }
  const fetched = await storage.get(stored.key);
  if (!fetched?.buffer?.length) {
    throw new Error(`${label}: download empty`);
  }
  await storage.delete(stored.key);
  console.log(`OK ${label} key=${stored.key} bytes=${fetched.buffer.byteLength}`);
}

async function rejectBadFile() {
  try {
    await storage.put({
      buffer: Buffer.from("not a real file"),
      mimeType: "text/plain",
      originalName: "note.txt",
      folder: "verify",
    });
    throw new Error("expected MIME reject");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/not allowed/i.test(msg)) throw error;
    console.log("OK reject non-PDF/image");
  }
}

async function legacyLocalGet() {
  const root = path.join(process.cwd(), "uploads");
  const rel = `verify-legacy/${Date.now()}-pixel.png`;
  const full = path.join(root, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, PNG_1X1);
  const fetched = await storage.get(rel);
  if (!fetched?.buffer.length) {
    throw new Error("legacy local get failed");
  }
  await storage.delete(rel);
  await unlink(full).catch(() => undefined);
  console.log("OK legacy local get/delete");
}

async function main() {
  assertEnv();
  await roundTrip("avatar png", PNG_1X1, "pixel.png", "avatars", "image");
  await roundTrip("case pdf", MINI_PDF, "note.pdf", "CSE-00001", "raw");
  await roundTrip("client png", PNG_1X1, "id.png", "CLI-00001", "image");
  await rejectBadFile();
  await legacyLocalGet();
  console.log("OK — all storage flows (Mongo stores keys only, not bytes)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
