import { describe, expect, it } from "vitest";
import { unreadNotificationWhere } from "@/lib/notifications/notify";

describe("unreadNotificationWhere", () => {
  it("matches both explicit null and unset readAt (Prisma Mongo)", () => {
    expect(unreadNotificationWhere).toEqual({
      OR: [{ readAt: null }, { readAt: { isSet: false } }],
    });
  });
});
