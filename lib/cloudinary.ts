import { v2 as cloudinary } from "cloudinary";

export type CloudinaryResourceType = "image" | "raw";

/** Private assets: server-signed download only; never public CDN. */
const ACCESS_TYPE = "private" as const;

export type CloudinaryUploadResult = {
  publicId: string;
  resourceType: CloudinaryResourceType;
  bytes: number;
  format: string | undefined;
};

let configured = false;

function configure(): void {
  if (configured) return;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = process.env.CLOUDINARY_API_KEY?.trim();
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error("Cloudinary is not configured");
  }
  cloudinary.config({
    cloud_name,
    api_key,
    api_secret,
    secure: true,
  });
  configured = true;
}

export function cloudinaryFolderRoot(): string {
  const folder = (process.env.CLOUDINARY_FOLDER ?? "mlf").trim();
  return folder.replace(/^\/+|\/+$/g, "") || "mlf";
}

export function uploadBuffer(input: {
  buffer: Buffer;
  folder: string;
  filename: string;
  resourceType: CloudinaryResourceType;
}): Promise<CloudinaryUploadResult> {
  configure();
  const { buffer, folder, filename, resourceType } = input;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        type: ACCESS_TYPE,
        use_filename: true,
        unique_filename: true,
        filename_override: filename,
      },
      (err, result) => {
        if (err || !result?.public_id) {
          reject(err instanceof Error ? err : new Error("Cloudinary upload failed"));
          return;
        }
        const rt = result.resource_type === "raw" ? "raw" : "image";
        resolve({
          publicId: result.public_id,
          resourceType: rt,
          bytes: result.bytes ?? buffer.byteLength,
          format: result.format,
        });
      }
    );
    stream.end(buffer);
  });
}

function formatFromPublicId(publicId: string): string {
  const base = publicId.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

async function tryFetch(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.byteLength > 0 ? buf : null;
}

export async function downloadBuffer(
  publicId: string,
  resourceType: CloudinaryResourceType
): Promise<Buffer | null> {
  configure();

  const formats = new Set<string>();
  const fromId = formatFromPublicId(publicId);
  if (fromId) formats.add(fromId);
  if (resourceType === "raw") formats.add("pdf");
  formats.add("");

  try {
    const info = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
      type: ACCESS_TYPE,
    });
    if (typeof info.format === "string" && info.format) formats.add(info.format);
    const direct =
      (typeof info.secure_url === "string" && info.secure_url) ||
      (typeof info.url === "string" && info.url) ||
      "";
    if (direct) {
      const fromInfo = await tryFetch(direct);
      if (fromInfo) return fromInfo;
    }
  } catch {
    // continue with signed download URLs
  }

  for (const format of formats) {
    const downloadUrl = cloudinary.utils.private_download_url(publicId, format, {
      resource_type: resourceType,
      type: ACCESS_TYPE,
      // 24h so slight local/Cloudinary clock skew does not yield "Stale request".
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      attachment: false,
    });
    const file = await tryFetch(downloadUrl);
    if (file) return file;
  }

  const signedUrl = cloudinary.url(publicId, {
    type: ACCESS_TYPE,
    resource_type: resourceType,
    sign_url: true,
    secure: true,
  });
  return tryFetch(signedUrl);
}

export async function destroyAsset(
  publicId: string,
  resourceType: CloudinaryResourceType
): Promise<string> {
  configure();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: ACCESS_TYPE,
    invalidate: true,
  });
  const status = typeof result.result === "string" ? result.result : "unknown";
  if (status !== "ok" && status !== "not found") {
    throw new Error(`Cloudinary destroy failed: ${status}`);
  }
  return status;
}
