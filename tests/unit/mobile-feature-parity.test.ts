import { describe, expect, it } from "vitest";
import { navItems } from "@/config/company/nav";

/**
 * Every staff website nav route must have a mobile counterpart.
 * Keep this list aligned with /Users/psmpasu/mlf-mobile/src/core/feature-map.ts
 */
const MOBILE_ROUTE_BY_WEB: Record<string, string> = {
  "/": "/(app)/(tabs)",
  "/clients": "/(app)/(tabs)/clients",
  "/cases": "/(app)/(tabs)/cases",
  "/diary": "/(app)/(tabs)/diary",
  "/appointments": "/(app)/appointments",
  "/availability": "/(app)/availability",
  "/court-roster": "/(app)/court-roster",
  "/accounts": "/(app)/accounts",
  "/expenses": "/(app)/expenses",
  "/hrms": "/(app)/hrms",
  "/dak": "/(app)/dak",
  "/tasks": "/(app)/tasks",
  "/reports": "/(app)/reports",
  "/employees": "/(app)/employees",
  "/activity": "/(app)/activity",
  "/permissions": "/(app)/permissions",
};

describe("mobile feature parity with website nav", () => {
  it("covers every staff nav href", () => {
    const missing = navItems
      .filter((item) => !item.clientOnly)
      .map((item) => item.href)
      .filter((href) => !MOBILE_ROUTE_BY_WEB[href]);
    expect(missing).toEqual([]);
  });

  it("does not invent unknown website routes", () => {
    const webHrefs = new Set(navItems.map((item) => item.href));
    const extra = Object.keys(MOBILE_ROUTE_BY_WEB).filter((href) => !webHrefs.has(href));
    expect(extra).toEqual([]);
  });
});
