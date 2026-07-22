import { formatUnitId, idConfig, type IdEntity } from "@/config/company/ids";
import { prisma } from "@/lib/db/prisma";

/**
 * Atomic sequential unitId via IdCounter.$inc.
 * Never "read max unitId" under concurrency.
 */
export async function nextUnitId(entity: IdEntity): Promise<string> {
  const prefix = idConfig.prefixes[entity];
  const counter = await prisma.idCounter.findUnique({ where: { entity } });

  if (!counter) {
    try {
      await prisma.idCounter.create({ data: { entity, seq: 1 } });
      return formatUnitId(prefix, 1);
    } catch {
      // Race: another create won — fall through to update
    }
  }

  const updated = await prisma.idCounter.update({
    where: { entity },
    data: { seq: { increment: 1 } },
  });

  return formatUnitId(prefix, updated.seq);
}
