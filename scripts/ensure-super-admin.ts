import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getEnvAdminMobiles, normalizeMobile } from "../lib/auth/mobile";
import { hashPin } from "../lib/auth/pin";
import {
  bootstrapPinFromEnv,
  shouldAutoSetBootstrapPin,
} from "../lib/auth/bootstrap-pin";
import { designationDefaultRoles } from "../config/company/designations";
import { formatUnitId, idConfig } from "../config/company/ids";

const prisma = new PrismaClient();
const PIN = bootstrapPinFromEnv();
const autoPin = shouldAutoSetBootstrapPin();

async function nextEmployeeUnitId() {
  const prefix = idConfig.prefixes.employee;
  const counter = await prisma.idCounter.findUnique({ where: { entity: "employee" } });
  if (!counter) {
    try {
      await prisma.idCounter.create({ data: { entity: "employee", seq: 1 } });
      return formatUnitId(prefix, 1);
    } catch {
      /* race */
    }
  }
  const updated = await prisma.idCounter.update({
    where: { entity: "employee" },
    data: { seq: { increment: 1 } },
  });
  return formatUnitId(prefix, updated.seq);
}

async function main() {
  const mobiles = getEnvAdminMobiles();
  const superRaw = process.env.SUPER_ADMIN_MOBILE;
  console.log("env SUPER_ADMIN_MOBILE=", superRaw, "normalized=", mobiles);
  if (mobiles.length === 0) {
    throw new Error("Set SUPER_ADMIN_MOBILE or ADMIN_MOBILE in .env");
  }

  const pinHash = autoPin ? await hashPin(PIN) : null;
  for (const mobile of mobiles) {
    const ten = mobile.slice(2);
    const existing = await prisma.user.findFirst({
      where: { mobile: { in: [mobile, ten] } },
    });
    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          mobile,
          isActive: true,
          roles: Array.from(new Set([...existing.roles, "admin"])),
          name: existing.name ?? "Super Admin",
          ...(existing.pinHash ? {} : pinHash ? { pinHash } : {}),
        },
      });
      console.log(
        `updated ${updated.unitId} ${updated.mobile} pin=${existing.pinHash ? "kept" : autoPin ? PIN : "otp_setup"}`
      );
      continue;
    }
    const unitId = await nextEmployeeUnitId();
    const created = await prisma.user.create({
      data: {
        unitId,
        mobile,
        roles: designationDefaultRoles["Managing Partner"],
        designation: "Managing Partner",
        name: mobile === normalizeMobile(process.env.SUPER_ADMIN_MOBILE ?? "")
          ? "Super Admin"
          : "Bootstrap Admin",
        ...(pinHash ? { pinHash } : {}),
        isActive: true,
      },
    });
    console.log(
      `created ${created.unitId} ${created.mobile} PIN=${autoPin ? PIN : "otp_setup on first login"}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
