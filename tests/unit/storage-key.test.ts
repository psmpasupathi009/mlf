import { describe, expect, it } from "vitest";
import {
  formatStorageKey,
  parseStorageKey,
} from "@/lib/storage/cloudinary-driver";

describe("parseStorageKey", () => {
  it("parses image and raw Cloudinary keys", () => {
    expect(parseStorageKey("image:mlf/avatars/uuid-avatar")).toEqual({
      kind: "cloudinary",
      resourceType: "image",
      publicId: "mlf/avatars/uuid-avatar",
    });
    expect(parseStorageKey("raw:mlf/docs/CSE-00001/uuid-file")).toEqual({
      kind: "cloudinary",
      resourceType: "raw",
      publicId: "mlf/docs/CSE-00001/uuid-file",
    });
  });

  it("treats keys without a type prefix as legacy local paths", () => {
    expect(parseStorageKey("avatars/old-photo.jpg")).toEqual({
      kind: "local",
      path: "avatars/old-photo.jpg",
    });
  });

  it("round-trips formatStorageKey", () => {
    const key = formatStorageKey("raw", "mlf/docs/file");
    expect(key).toBe("raw:mlf/docs/file");
    expect(parseStorageKey(key).kind).toBe("cloudinary");
  });
});
