import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hashPin } from "@/lib/auth/pin";
import { nextUnitId } from "@/lib/ids";
import { designationDefaultRoles } from "@/config/company/designations";
import {
  bootstrapPinFromEnv,
  shouldAutoSetBootstrapPin,
} from "@/lib/auth/bootstrap-pin";
import {
  getEnvAdminMobiles,
  isEnvAdminMobile,
} from "@/lib/auth/mobile";

function loginAliases(mobile91: string): string[] {
  const ten = mobile91.startsWith("91") ? mobile91.slice(2) : mobile91;
  return Array.from(new Set([mobile91, ten]));
}

/** Find a user by 91… or bare 10-digit storage. */
export async function findUserByLoginMobile(
  mobile91: string
): Promise<User | null> {
  const aliases = loginAliases(mobile91);
  const users = await prisma.user.findMany({
    where: { mobile: { in: aliases } },
  });
  return users[0] ?? null;
}

/**
 * Create or revive the env super-admin so they can log in without a prior seed.
 * Keeps an existing PIN (Forgot PIN / setup).
 * Dev only: sets default SEED_PIN when pinHash is empty. Production: OTP setup on first login.
 */
export async function ensureEnvAdminUser(mobile91: string): Promise<User | null> {
  if (!isEnvAdminMobile(mobile91)) return null;

  const existing = await findUserByLoginMobile(mobile91);
  const roles = Array.from(
    new Set<UserRole>([
      ...(existing?.roles ?? []),
      ...designationDefaultRoles["Managing Partner"],
      "admin",
    ])
  );

  const defaultPinHash =
    shouldAutoSetBootstrapPin() && !existing?.pinHash
      ? await hashPin(bootstrapPinFromEnv())
      : undefined;

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        mobile: mobile91,
        roles,
        isActive: true,
        failedPinAttempts: 0,
        pinLockedUntil: null,
        name: existing.name ?? "Super Admin",
        designation: existing.designation ?? "Managing Partner",
        ...(defaultPinHash ? { pinHash: defaultPinHash } : {}),
      },
    });
  }

  const unitId = await nextUnitId("employee");
  return prisma.user.create({
    data: {
      unitId,
      mobile: mobile91,
      roles,
      designation: "Managing Partner",
      name: "Super Admin",
      ...(defaultPinHash ? { pinHash: defaultPinHash } : {}),
      isActive: true,
    },
  });
}

export async function ensureAllEnvAdminUsers(): Promise<void> {
  for (const mobile of getEnvAdminMobiles()) {
    await ensureEnvAdminUser(mobile);
  }
}
