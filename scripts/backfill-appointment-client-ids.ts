/**
 * Backfill Appointment.clientId when clientUnitId is set but clientId is null.
 *   DATABASE_URL=... npx tsx scripts/backfill-appointment-client-ids.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.appointment.findMany({
    where: {
      clientUnitId: { not: null },
      OR: [{ clientId: null }, { clientId: { isSet: false } }],
    },
    select: { id: true, unitId: true, clientUnitId: true },
  });

  let updated = 0;
  let missing = 0;

  for (const row of rows) {
    const clientUnitId = row.clientUnitId!;
    const client = await prisma.client.findUnique({
      where: { unitId: clientUnitId },
      select: { id: true },
    });
    if (!client) {
      missing += 1;
      console.warn(`SKIP ${row.unitId}: client ${clientUnitId} not found`);
      continue;
    }
    await prisma.appointment.update({
      where: { id: row.id },
      data: { clientId: client.id },
    });
    updated += 1;
  }

  console.log(
    `Done. scanned=${rows.length} updated=${updated} missingClient=${missing}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
