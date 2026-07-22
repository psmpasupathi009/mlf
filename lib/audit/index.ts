import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function writeAudit(input: {
  actorUnitId?: string | null;
  action: string;
  entity: string;
  entityUnitId?: string | null;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUnitId: input.actorUnitId ?? null,
      action: input.action,
      entity: input.entity,
      entityUnitId: input.entityUnitId ?? null,
      meta: input.meta,
    },
  });
}
