/**
 * Quick Atlas connectivity check with actionable errors.
 *   npx tsx scripts/db-ping.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  buildMongoDatabaseUrl,
  isDbUnreachableError,
} from "../lib/db/prisma";

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) {
    console.error("DATABASE_URL is missing in .env");
    process.exit(1);
  }

  const url = buildMongoDatabaseUrl(base);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

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
  1. Atlas → Network Access → allow this machine’s IP (or 0.0.0.0/0 for deploy)
  2. Cluster paused / no primary
  3. VPN / firewall blocking *.mongodb.net:27017
TLS "InternalError" before login usually means the IP is not allowlisted.`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
