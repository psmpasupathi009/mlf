import { describe, expect, it } from "vitest";
import {
  diffAudit,
  pickAuditFields,
  redactForAudit,
} from "@/lib/audit";
import { actionLabel, entityHref } from "@/features/activity/lib/action-labels";

describe("redactForAudit", () => {
  it("strips secrets and truncates long strings", () => {
    const long = "x".repeat(2500);
    const out = redactForAudit({
      name: "Ada",
      pinHash: "secret",
      pin: "1234",
      password: "nope",
      notes: long,
      nested: { token: "abc", ok: true },
    }) as Record<string, unknown>;

    expect(out.name).toBe("Ada");
    expect(out.pinHash).toBeUndefined();
    expect(out.pin).toBeUndefined();
    expect(out.password).toBeUndefined();
    expect(String(out.notes).endsWith("…")).toBe(true);
    expect(String(out.notes).length).toBe(2001);
    expect((out.nested as Record<string, unknown>).token).toBeUndefined();
    expect((out.nested as Record<string, unknown>).ok).toBe(true);
  });

  it("serializes dates and caps arrays", () => {
    const d = new Date("2026-01-15T10:00:00.000Z");
    const out = redactForAudit({
      when: d,
      items: Array.from({ length: 60 }, (_, i) => i),
    }) as Record<string, unknown>;
    expect(out.when).toBe(d.toISOString());
    expect(Array.isArray(out.items) && out.items).toHaveLength(50);
  });
});

describe("diffAudit / pickAuditFields", () => {
  it("returns only changed fields", () => {
    const before = { title: "A", status: "open", notes: null };
    const after = { title: "A", status: "done", notes: "ok" };
    expect(diffAudit(before, after)).toEqual({
      status: { from: "open", to: "done" },
      notes: { from: null, to: "ok" },
    });
  });

  it("reports empty map when nothing changed", () => {
    expect(diffAudit({ a: 1 }, { a: 1 })).toEqual({});
  });

  it("picks and normalizes dates", () => {
    const when = new Date("2026-07-01T00:00:00.000Z");
    const picked = pickAuditFields(
      { title: "x", when, skip: 1 } as Record<string, unknown>,
      ["title", "when"] as const
    );
    expect(picked).toEqual({ title: "x", when: when.toISOString() });
  });
});

describe("activity labels", () => {
  it("maps known actions and falls back cleanly", () => {
    expect(actionLabel("client.create")).toBe("Created client");
    expect(actionLabel("custom.thing_done")).toBe("custom · thing done");
  });

  it("builds entity hrefs including hearing case links", () => {
    expect(entityHref("Client", "CL-1")).toBe("/clients/CL-1");
    expect(entityHref("Hearing", "H-1", { after: { caseUnitId: "CS-9" } })).toBe(
      "/cases/CS-9"
    );
    expect(entityHref("Hearing", "H-1")).toBe("/diary");
    expect(entityHref("Document", "D-1")).toBeNull();
  });
});
