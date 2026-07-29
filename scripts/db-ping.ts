/**
 * Quick Atlas connectivity check with actionable errors.
 *   npx tsx scripts/db-ping.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { isDbUnreachableError } from "../lib/db/unreachable";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing in .env");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const users = await prisma.user.count();
    console.log(`OK — connected (users=${users})`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("FAIL — cannot reach MongoDB");
    console.error(msg.slice(0, 280));
    if (
      isDbUnreachableError(error) ||
      /internalerror|tlsv1|server selection/i.test(msg)
    ) {
      console.error(`
Likely causes:
  1. Wrong or missing DATABASE_URL in .env
  2. Cluster paused / no primary
  3. VPN / firewall blocking *.mongodb.net:27017`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
