import { cache } from "react";
import type { User, UserRole } from "@prisma/client";
import { isModuleEnabled, type AppModule } from "@/config/company/modules";
import { catalogPermissionKeys } from "@/config/company/permissions-defaults";
import { prisma } from "@/lib/db/prisma";
import { jsonFail } from "@/lib/api/response";
import { ensureDefaultPermissions } from "@/lib/rbac/ensure-permissions";

export type Permission = { module: string; action: string };
export { ensureDefaultPermissions } from "@/lib/rbac/ensure-permissions";

function permKey(module: string, action: string): string {
  return `${module}.${action}`;
}

function fullAdminPermissions(): Set<string> {
  return new Set(catalogPermissionKeys());
}

/**
 * Effective permissions = union of RolePermission rows for user.roles.
 * Admin always receives the full catalog (cannot be locked out).
 * Always from DB for non-admin — never trust JWT or client body.
 * Request-scoped via React cache() when called from RSC / same request tree.
 */
export const getEffectivePermissions = cache(
  async (userId: string): Promise<Set<string>> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { roles: true, isActive: true },
    });

    if (!user || !user.isActive || user.roles.length === 0) {
      return new Set();
    }

    await ensureDefaultPermissions();

    if (user.roles.includes("admin")) {
      return fullAdminPermissions();
    }

    const rows = await prisma.rolePermission.findMany({
      where: {
        role: { in: user.roles },
        allowed: true,
      },
      select: { module: true, action: true },
    });

    return new Set(rows.map((r) => permKey(r.module, r.action)));
  }
);

export async function getEffectivePermissionsForUser(user: {
  id: string;
  roles: UserRole[];
  isActive: boolean;
}): Promise<string[]> {
  if (!user.isActive || user.roles.length === 0) return [];
  const set = await getEffectivePermissions(user.id);
  return Array.from(set).sort();
}

/** Effective permissions for a bare set of roles — no user record required. */
export async function getEffectivePermissionsForRoles(
  roles: UserRole[]
): Promise<string[]> {
  if (roles.length === 0) return [];
  await ensureDefaultPermissions();
  if (roles.includes("admin")) {
    return catalogPermissionKeys().sort();
  }
  const rows = await prisma.rolePermission.findMany({
    where: { role: { in: roles }, allowed: true },
    select: { module: true, action: true },
  });
  return Array.from(new Set(rows.map((r) => permKey(r.module, r.action)))).sort();
}

export async function hasPermission(
  userId: string,
  module: string,
  action: string
): Promise<boolean> {
  const perms = await getEffectivePermissions(userId);
  return perms.has(permKey(module, action));
}

export async function requirePermission(
  user: Pick<User, "id">,
  module: string,
  action: string
) {
  const ok = await hasPermission(user.id, module, action);
  if (!ok) {
    return jsonFail(
      "FORBIDDEN",
      "You don’t have access. Ask admin.",
      403
    );
  }
  return null;
}

export function requireModuleEnabled(module: AppModule) {
  if (!isModuleEnabled(module)) {
    return jsonFail("FORBIDDEN", "This module is not available", 403);
  }
  return null;
}

export function rolesInclude(roles: UserRole[], role: UserRole): boolean {
  return roles.includes(role);
}
