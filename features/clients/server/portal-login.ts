import type { Client, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeMobile } from "@/lib/auth/mobile";
import { isStaffUser } from "@/lib/auth/client-portal";

export type ClientPortalLoginStatus = {
  /** Linked login User row exists for this client file. */
  hasLoginAccount: boolean;
  /** Client may sign in at /login (User exists and isActive). */
  portalEnabled: boolean;
  userUnitId: string | null;
  hasPin: boolean;
  lastLoginAt: string | null;
};

function isClientPortalLoginUser(user: Pick<User, "roles"> | null): boolean {
  if (!user?.roles.length) return false;
  return user.roles.every((r) => r === "client");
}

export async function getClientPortalLoginUser(
  clientUnitId: string
): Promise<User | null> {
  const portalUser = await prisma.user.findUnique({
    where: { clientUnitId },
  });
  if (!portalUser || !isClientPortalLoginUser(portalUser)) return null;
  return portalUser;
}

export async function getClientPortalLoginStatus(
  clientUnitId: string
): Promise<ClientPortalLoginStatus> {
  const portalUser = await getClientPortalLoginUser(clientUnitId);
  if (!portalUser) {
    return {
      hasLoginAccount: false,
      portalEnabled: false,
      userUnitId: null,
      hasPin: false,
      lastLoginAt: null,
    };
  }
  return {
    hasLoginAccount: true,
    portalEnabled: portalUser.isActive,
    userUnitId: portalUser.unitId,
    hasPin: Boolean(portalUser.pinHash),
    lastLoginAt: portalUser.lastLoginAt?.toISOString() ?? null,
  };
}

/** Fail if mobile is already a staff login or another client's portal login. */
export async function assertClientPortalMobileAvailable(
  mobile91: string,
  options?: { excludeUserId?: string; clientUnitId?: string }
): Promise<string | null> {
  const existing = await prisma.user.findUnique({ where: { mobile: mobile91 } });
  if (!existing || existing.id === options?.excludeUserId) return null;

  if (isStaffUser(existing.roles)) {
    return "This mobile is already a staff login. Use a different mobile on the client record.";
  }

  if (
    existing.clientUnitId &&
    existing.clientUnitId !== options?.clientUnitId
  ) {
    return "This mobile is already linked to another client portal account.";
  }

  return null;
}

async function assertClientLoginUnitIdAvailable(
  clientUnitId: string,
  excludeUserId?: string
): Promise<string | null> {
  const byUnit = await prisma.user.findUnique({ where: { unitId: clientUnitId } });
  if (!byUnit || byUnit.id === excludeUserId) return null;
  if (byUnit.clientUnitId === clientUnitId) return null;
  return "This client id is already used by another login account.";
}

function portalLoginProfile(client: Pick<Client, "name" | "email" | "address">) {
  return {
    name: client.name,
    email: client.email || undefined,
    address: client.address || undefined,
  };
}

/**
 * Enable client portal login — create or revive User (unitId = CLI-#####, role client).
 */
export async function enableClientPortalLogin(
  client: Client,
  options?: { createdById?: string }
): Promise<User> {
  const mobile = normalizeMobile(client.mobile);
  if (!mobile) {
    throw new Error("Client mobile is invalid");
  }

  const mobileMsg = await assertClientPortalMobileAvailable(mobile, {
    clientUnitId: client.unitId,
  });
  if (mobileMsg) throw new Error(mobileMsg);

  const existing = await getClientPortalLoginUser(client.unitId);
  if (existing) {
    const unitMsg = await assertClientLoginUnitIdAvailable(
      client.unitId,
      existing.id
    );
    if (unitMsg) throw new Error(unitMsg);

    return prisma.user.update({
      where: { id: existing.id },
      data: {
        unitId: client.unitId,
        mobile,
        roles: ["client"],
        isActive: true,
        ...portalLoginProfile(client),
      },
    });
  }

  const existingByMobile = await prisma.user.findUnique({ where: { mobile } });
  if (existingByMobile) {
    const unitMsg = await assertClientLoginUnitIdAvailable(
      client.unitId,
      existingByMobile.id
    );
    if (unitMsg) throw new Error(unitMsg);

    return prisma.user.update({
      where: { id: existingByMobile.id },
      data: {
        unitId: client.unitId,
        clientUnitId: client.unitId,
        roles: ["client"],
        isActive: true,
        ...portalLoginProfile(client),
      },
    });
  }

  const unitMsg = await assertClientLoginUnitIdAvailable(client.unitId);
  if (unitMsg) throw new Error(unitMsg);

  return prisma.user.create({
    data: {
      unitId: client.unitId,
      mobile,
      roles: ["client"],
      clientUnitId: client.unitId,
      isActive: true,
      createdById: options?.createdById,
      ...portalLoginProfile(client),
    },
  });
}

export async function disableClientPortalLogin(
  clientUnitId: string
): Promise<User> {
  const portalUser = await getClientPortalLoginUser(clientUnitId);
  if (!portalUser) {
    throw new Error("No portal login for this client");
  }

  return prisma.user.update({
    where: { id: portalUser.id },
    data: { isActive: false },
  });
}

export async function syncClientPortalLoginFromClient(
  client: Client
): Promise<void> {
  const portalUser = await getClientPortalLoginUser(client.unitId);
  if (!portalUser) return;

  const mobile = normalizeMobile(client.mobile);
  if (!mobile) return;

  const mobileMsg = await assertClientPortalMobileAvailable(mobile, {
    excludeUserId: portalUser.id,
    clientUnitId: client.unitId,
  });
  if (mobileMsg) return;

  await prisma.user.update({
    where: { id: portalUser.id },
    data: {
      name: client.name,
      mobile,
      email: client.email || undefined,
      address: client.address || undefined,
    },
  });
}
