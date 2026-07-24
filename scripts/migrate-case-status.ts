/**
 * One-shot: map legacy CaseStatus pending→pre_filing, listed→active.
 * Run: npx tsx scripts/migrate-case-status.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.case.updateMany({
    where: { status: "pending" },
    data: { status: "pre_filing" },
  });
  const listed = await prisma.case.updateMany({
    where: { status: "listed" },
    data: { status: "active" },
  });
  console.log(
    `Migrated cases: pending→pre_filing=${pending.count}, listed→active=${listed.count}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
