import "dotenv/config";
import { PrismaClient, type UserRole } from "@prisma/client";
import { permissionSeedRows } from "../config/company/permissions-defaults";
import { formatUnitId, idConfig } from "../config/company/ids";

const prisma = new PrismaClient();

async function seedPermissions() {
  const rows = permissionSeedRows();
  let upserted = 0;

  for (const row of rows) {
    await prisma.rolePermission.upsert({
      where: {
        role_module_action: {
          role: row.role,
          module: row.module,
          action: row.action,
        },
      },
      create: row,
      update: { allowed: row.allowed },
    });
    upserted += 1;
  }

  console.log(`RolePermission: upserted ${upserted} rows`);
}

/**
 * Best-effort migrate legacy documents that still have `role` (singular)
 * and/or missing unitId. Safe to re-run.
 */
async function migrateLegacyUsers() {
  const raw = await prisma.$runCommandRaw({
    find: "User",
    filter: {},
    limit: 500,
  });

  const docs =
    (raw as { cursor?: { firstBatch?: Record<string, unknown>[] } }).cursor
      ?.firstBatch ?? [];

  if (docs.length === 0) {
    console.log("User migrate: no documents");
    return;
  }

  let seq = 0;
  const counter = await prisma.idCounter.findUnique({
    where: { entity: "employee" },
  });
  if (counter) seq = counter.seq;

  let migrated = 0;

  for (const doc of docs) {
    const id = doc._id;
    if (!id) continue;

    const updates: Record<string, unknown> = {};

    if (!doc.unitId) {
      seq += 1;
      updates.unitId = formatUnitId(idConfig.prefixes.employee, seq);
    }

    if (!Array.isArray(doc.roles) || (doc.roles as unknown[]).length === 0) {
      const legacy = doc.role as string | undefined;
      const roles: UserRole[] = [];
      if (
        legacy === "admin" ||
        legacy === "sub_admin" ||
        legacy === "staff" ||
        legacy === "advocate" ||
        legacy === "accountant"
      ) {
        roles.push(legacy);
      } else {
        roles.push("staff");
      }
      updates.roles = roles;
    }

    if (doc.designation === "Administration") {
      updates.designation = "Office Manager";
    }
    if (doc.designation === "Principal") {
      updates.designation = "Managing Partner";
    }

    if (Object.keys(updates).length === 0) continue;

    await prisma.$runCommandRaw({
      update: "User",
      updates: [
        {
          q: { _id: id },
          u: { $set: updates, $unset: { role: "" } },
        } as never,
      ],
    });
    migrated += 1;
  }

  if (seq > 0) {
    await prisma.idCounter.upsert({
      where: { entity: "employee" },
      create: { entity: "employee", seq },
      update: { seq },
    });
  }

  console.log(`User migrate: updated ${migrated} document(s), employee seq=${seq}`);
}

async function main() {
  await seedPermissions();
  await migrateLegacyUsers();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
