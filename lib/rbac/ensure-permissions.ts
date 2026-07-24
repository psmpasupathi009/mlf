import { prisma } from "@/lib/db/prisma";
import {
  PERMISSION_CATALOG,
  permissionSeedRows,
} from "@/config/company/permissions-defaults";

let seeding: Promise<boolean> | null = null;
/** Process-local: skip DB probes after catalog is known complete. */
let knownSeeded = false;

/**
 * Persist catalog defaults when RolePermission is empty, and backfill any
 * newly added catalog keys (e.g. dak.*, tasks.*) without overwriting admin edits.
 * Returns true when a seed/backfill write ran.
 */
export async function ensureDefaultPermissions(): Promise<boolean> {
  if (knownSeeded) return false;

  if (!seeding) {
    seeding = (async () => {
      const catalogKeys = PERMISSION_CATALOG.map(
        (c) => `${c.module}.${c.action}`
      );
      const adminRows = await prisma.rolePermission.findMany({
        where: { role: "admin" },
        select: { module: true, action: true },
      });
      const adminKeys = new Set(
        adminRows.map((r) => `${r.module}.${r.action}`)
      );
      const missing = catalogKeys.some((k) => !adminKeys.has(k));
      const empty = adminRows.length === 0;

      if (!empty && !missing) {
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
            // Don't clobber an admin matrix save.
            update: {},
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
