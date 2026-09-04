import { prisma } from "@/lib/db/prisma";
import {
  PERMISSION_CATALOG,
  permissionSeedRows,
} from "@/config/company/permissions-defaults";

let seeding: Promise<boolean> | null = null;
/** Process-local: skip DB probes after catalog is known complete. */
let knownSeeded = false;
/** Process-local: client self-booking revoke applied once. */
let clientApptCreateRevoked = false;

/**
 * Office-only booking: clients must not keep appointments.create from older seeds.
 */
async function revokeClientAppointmentCreate(): Promise<void> {
  if (clientApptCreateRevoked) return;
  await prisma.rolePermission.updateMany({
    where: {
      role: "client",
      module: "appointments",
      action: "create",
      allowed: true,
    },
    data: { allowed: false },
  });
  clientApptCreateRevoked = true;
}

/**
 * Persist catalog defaults when RolePermission is empty, and backfill any
 * newly added catalog keys or roles (e.g. client) without overwriting admin edits.
 * Returns true when a seed/backfill write ran.
 */
export async function ensureDefaultPermissions(): Promise<boolean> {
  await revokeClientAppointmentCreate();

  if (knownSeeded) return false;

  if (!seeding) {
    seeding = (async () => {
      const catalogKeys = PERMISSION_CATALOG.map(
        (c) => `${c.module}.${c.action}`
      );
      const expectedRoles = Array.from(
        new Set(permissionSeedRows().map((r) => r.role))
      );

      const [adminRows, roleRows] = await Promise.all([
        prisma.rolePermission.findMany({
          where: { role: "admin" },
          select: { module: true, action: true },
        }),
        prisma.rolePermission.findMany({
          distinct: ["role"],
          select: { role: true },
        }),
      ]);

      const adminKeys = new Set(
        adminRows.map((r) => `${r.module}.${r.action}`)
      );
      const rolesPresent = new Set(roleRows.map((r) => r.role));
      const missingCatalog = catalogKeys.some((k) => !adminKeys.has(k));
      const missingRole = expectedRoles.some((r) => !rolesPresent.has(r));
      const empty = adminRows.length === 0;

      if (!empty && !missingCatalog && !missingRole) {
        knownSeeded = true;
        return false;
      }

      const rows = permissionSeedRows();
      await Promise.all(
        rows.map((row) =>
          prisma.rolePermission.upsert({
            where: {
              role_module_action: {
                role: row.role,
                module: row.module,
                action: row.action,
              },
            },
            create: row,
            // Keep admin fully open; don't clobber other roles' matrix saves.
            update: row.role === "admin" ? { allowed: true } : {},
          })
        )
      );
      knownSeeded = true;
      return true;
    })().finally(() => {
      seeding = null;
    });
  }

  return seeding;
}
