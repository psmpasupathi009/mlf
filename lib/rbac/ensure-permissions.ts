import { prisma } from "@/lib/db/prisma";
import { permissionSeedRows } from "@/config/company/permissions-defaults";

let seeding: Promise<boolean> | null = null;
/** Process-local: skip `count()` after we know RolePermission is populated. */
let knownSeeded = false;

/**
 * Persist catalog defaults when RolePermission is empty.
 * Without this, every portal page is forbidden until someone saves the matrix.
 * Returns true when a seed write ran.
 */
export async function ensureDefaultPermissions(): Promise<boolean> {
  if (knownSeeded) return false;

  const count = await prisma.rolePermission.count();
  if (count > 0) {
    knownSeeded = true;
    return false;
  }

  if (!seeding) {
    seeding = (async () => {
      const stillEmpty = (await prisma.rolePermission.count()) === 0;
      if (!stillEmpty) {
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
            // Don't clobber a concurrent admin save mid-seed.
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
