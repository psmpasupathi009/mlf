/**
 * One-time: align client portal User.unitId with Client.unitId (CLI-#####).
 * Legacy portal enables used EMP-##### for User.unitId; new code uses CLI.
 *
 * Usage: npx tsx scripts/backfill-client-portal-login-ids.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const portalUsers = await prisma.user.findMany({
    where: {
      clientUnitId: { not: null },
      roles: { equals: ["client"] },
    },
    select: {
      id: true,
      unitId: true,
      clientUnitId: true,
      mobile: true,
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const u of portalUsers) {
    const cli = u.clientUnitId!;
    if (u.unitId === cli) continue;

    const clash = await prisma.user.findUnique({ where: { unitId: cli } });
    if (clash && clash.id !== u.id) {
      console.warn(
        `SKIP ${u.mobile}: cannot set unitId=${cli} (already used by ${clash.id})`
      );
      skipped++;
      continue;
    }

    await prisma.user.update({
      where: { id: u.id },
      data: { unitId: cli },
    });
    console.log(`updated ${u.unitId} -> ${cli} (${u.mobile})`);
    updated++;
  }

  console.log(
    `Done. ${updated} updated, ${skipped} skipped, ${portalUsers.length - updated - skipped} already aligned.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
