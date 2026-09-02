import { describe, expect, it } from "vitest";
import type { ClientPortalLoginStatus } from "@/features/clients/server/portal-login";

describe("ClientPortalLoginStatus", () => {
  it("uses hasLoginAccount and portalEnabled", () => {
    const off: ClientPortalLoginStatus = {
      hasLoginAccount: false,
      portalEnabled: false,
      userUnitId: null,
      hasPin: false,
      lastLoginAt: null,
    };
    const on: ClientPortalLoginStatus = {
      hasLoginAccount: true,
      portalEnabled: true,
      userUnitId: "CLI-00001",
      hasPin: true,
      lastLoginAt: "2026-01-01T00:00:00.000Z",
    };
    expect(off.portalEnabled).toBe(false);
    expect(on.hasLoginAccount).toBe(true);
    expect(on.userUnitId).toMatch(/^CLI-/);
  });
});
