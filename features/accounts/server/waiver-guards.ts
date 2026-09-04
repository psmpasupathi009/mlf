import type { User } from "@prisma/client";

/** Can request/create waivers (admin or sub_admin). */
export function isWaiverRole(user: Pick<User, "roles">): boolean {
  return user.roles.some((r) => r === "admin" || r === "sub_admin");
}

/** Only admin can approve (and auto-apply) fee waivers. */
export function isAdminRole(user: Pick<User, "roles">): boolean {
  return user.roles.includes("admin");
}

/** Statuses that reduce outstanding (legacy `active` = approved). */
export const APPROVED_WAIVER_STATUSES = ["approved", "active"] as const;

export const PENDING_WAIVER_STATUS = "pending";
export const VOID_WAIVER_STATUS = "void";
