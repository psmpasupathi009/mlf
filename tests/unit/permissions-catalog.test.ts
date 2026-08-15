import { describe, expect, it } from "vitest";
import {
  PERMISSION_CATALOG,
  catalogPermissionKeys,
  defaultAllowed,
} from "@/config/company/permissions-defaults";

describe("admin catalog", () => {
  it("grants every catalog permission to admin", () => {
    for (const { module, action } of PERMISSION_CATALOG) {
      expect(defaultAllowed("admin", module, action)).toBe(true);
    }
    expect(catalogPermissionKeys()).toHaveLength(PERMISSION_CATALOG.length);
  });
});
