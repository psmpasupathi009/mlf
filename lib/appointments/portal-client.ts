import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Prisma Mongo: optional DateTime unset ≠ `null` — match both. */
export function unsetOrNullDateWhere(
  field: string
): Prisma.AppointmentWhereInput {
  return {
    OR: [{ [field]: null }, { [field]: { isSet: false } }],
  } as Prisma.AppointmentWhereInput;
}

/** Active portal login linked to a Client unitId (CLI-…). */
export async function findPortalClientUser(clientUnitId: string) {
  return prisma.user.findFirst({
    where: {
      isActive: true,
      roles: { has: "client" },
      OR: [{ clientUnitId }, { unitId: clientUnitId }],
    },
    select: { id: true, unitId: true },
  });
}
