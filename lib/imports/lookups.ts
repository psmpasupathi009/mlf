import { prisma } from "@/lib/db/prisma";
import { normalizeMobile } from "@/lib/auth/mobile";

export type ImportClientRef = {
  id: string;
  unitId: string;
  mobile: string;
};

export type ImportCaseRef = {
  id: string;
  unitId: string;
  clientUnitId: string;
  status: string;
  caseNumber: string | null;
  cnr: string | null;
  nextHearingAt: Date | null;
};

export type ImportUserRef = {
  id: string;
  unitId: string;
  roles: string[];
};

export async function findClientByUnitId(
  unitId: string
): Promise<ImportClientRef | null> {
  const id = unitId.trim();
  if (!id) return null;
  return prisma.client.findUnique({
    where: { unitId: id },
    select: { id: true, unitId: true, mobile: true },
  });
}

export async function findClientByMobile(
  mobileInput: string
): Promise<ImportClientRef | null> {
  const mobile = normalizeMobile(mobileInput);
  if (!mobile) return null;
  return prisma.client.findFirst({
    where: { mobile },
    select: { id: true, unitId: true, mobile: true },
  });
}

export async function findCaseByUnitId(
  unitId: string
): Promise<ImportCaseRef | null> {
  const id = unitId.trim();
  if (!id) return null;
  return prisma.case.findUnique({
    where: { unitId: id },
    select: {
      id: true,
      unitId: true,
      clientUnitId: true,
      status: true,
      caseNumber: true,
      cnr: true,
      nextHearingAt: true,
    },
  });
}

export async function findUserByUnitId(
  unitId: string
): Promise<ImportUserRef | null> {
  const id = unitId.trim();
  if (!id) return null;
  return prisma.user.findUnique({
    where: { unitId: id },
    select: { id: true, unitId: true, roles: true },
  });
}

/** True when case belongs to client. */
export function caseBelongsToClient(
  caseItem: { clientUnitId: string },
  clientUnitId: string
): boolean {
  return caseItem.clientUnitId === clientUnitId;
}
