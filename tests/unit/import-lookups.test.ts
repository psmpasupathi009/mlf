import { describe, expect, it } from "vitest";
import {
  findIgnoredImportColumns,
  IMPORT_CASE_COLUMNS,
  IMPORT_CLIENT_COLUMNS,
} from "@/lib/imports/columns";
import { caseBelongsToClient } from "@/lib/imports/lookups";
import { parseIstDateInput } from "@/lib/utils/ist";

describe("findIgnoredImportColumns", () => {
  it("returns empty when only allowed headers are present", () => {
    expect(
      findIgnoredImportColumns(
        [{ unitId: "", name: "A", mobile: "9876543210" }],
        IMPORT_CLIENT_COLUMNS
      )
    ).toEqual([]);
  });

  it("lists unknown headers sorted", () => {
    expect(
      findIgnoredImportColumns(
        [
          {
            name: "A",
            mobile: "9876543210",
            address: "x",
            email: "a@b.c",
          },
        ],
        IMPORT_CLIENT_COLUMNS
      )
    ).toEqual(["address", "email"]);
  });

  it("flags dropped case link columns", () => {
    expect(
      findIgnoredImportColumns(
        [{ clientUnitId: "CLI-1", clientMobile: "9876543210", caseNumber: "OS/1" }],
        IMPORT_CASE_COLUMNS
      )
    ).toContain("clientMobile");
  });
});

describe("caseBelongsToClient", () => {
  it("matches clientUnitId", () => {
    expect(caseBelongsToClient({ clientUnitId: "CLI-1" }, "CLI-1")).toBe(true);
    expect(caseBelongsToClient({ clientUnitId: "CLI-1" }, "CLI-2")).toBe(false);
  });
});

describe("parseIstDateInput for hearing import", () => {
  it("parses YYYY-MM-DD as IST day start", () => {
    const d = parseIstDateInput("2024-09-15");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2024-09-14T18:30:00.000Z");
  });

  it("rejects empty and invalid", () => {
    expect(parseIstDateInput("")).toBeNull();
    expect(parseIstDateInput("not-a-date")).toBeNull();
  });
});
