import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PrismaClient,
  type CaseStatus,
  type PaymentStatus,
  type PaymentType,
  type UserRole,
} from "@prisma/client";
import { permissionSeedRows } from "../config/company/permissions-defaults";
import { formatUnitId, idConfig } from "../config/company/ids";
import {
  designationDefaultRoles,
  normalizeDesignation,
} from "../config/company/designations";
import { normalizeCaseStatus } from "../config/company/case-pipeline";
import { OFFICE_ROSTER } from "../config/company/office-roster";
import { normalizeMobile } from "../lib/auth/mobile";
import { hashPin } from "../lib/auth/pin";
import { parseCsv } from "../lib/utils/csv";
import { nextUnitId } from "../lib/ids";

const prisma = new PrismaClient();
const DATA = join(process.cwd(), "prisma", "data");
const RESET_STAFF = process.argv.includes("--reset-staff");
/** Delete all business data + non-admin users; keep env ADMIN_MOBILE + RolePermission. */
const WIPE_KEEP_ADMIN = process.argv.includes("--wipe-keep-admin");

/** Dev/test PIN for seeded users (override with SEED_PIN). */
const SEED_PIN = process.env.SEED_PIN ?? "123456";

function loadCsv(name: string): Record<string, string>[] {
  return parseCsv(readFileSync(join(DATA, name), "utf8"));
}

function parseDay(value: string | undefined | null): Date | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Resolve TODAY_10:30 / TOMORROW_14:00 / DAY_AFTER_09:30 relative slots. */
function parseRelativeSlot(value: string): Date | undefined {
  const m = value
    .trim()
    .match(/^(TODAY|TOMORROW|DAY_AFTER)_(\d{1,2}):(\d{2})$/i);
  if (!m) return parseDay(value);
  const base = new Date();
  base.setSeconds(0, 0);
  if (m[1]!.toUpperCase() === "TOMORROW") base.setDate(base.getDate() + 1);
  if (m[1]!.toUpperCase() === "DAY_AFTER") base.setDate(base.getDate() + 2);
  base.setHours(Number(m[2]), Number(m[3]), 0, 0);
  return base;
}

async function seedPermissions() {
  const rows = permissionSeedRows();
  let upserted = 0;
  for (const row of rows) {
    await prisma.rolePermission.upsert({
      where: {
        role_module_action: {
          role: row.role,
          module: row.module,
          action: row.action,
        },
      },
      create: row,
      update: { allowed: row.allowed },
    });
    upserted += 1;
  }
  console.log(`RolePermission: upserted ${upserted} rows`);
}

/**
 * Best-effort migrate legacy documents that still have `role` (singular)
 * and/or missing unitId. Safe to re-run.
 */
async function migrateLegacyUsers() {
  const raw = await prisma.$runCommandRaw({
    find: "User",
    filter: {},
    limit: 500,
  });

  const docs =
    (raw as { cursor?: { firstBatch?: Record<string, unknown>[] } }).cursor
      ?.firstBatch ?? [];

  if (docs.length === 0) {
    console.log("User migrate: no documents");
    return;
  }

  let seq = 0;
  const counter = await prisma.idCounter.findUnique({
    where: { entity: "employee" },
  });
  if (counter) seq = counter.seq;

  let migrated = 0;

  for (const doc of docs) {
    const id = doc._id;
    if (!id) continue;

    const updates: Record<string, unknown> = {};

    if (!doc.unitId) {
      seq += 1;
      updates.unitId = formatUnitId(idConfig.prefixes.employee, seq);
    }

    if (!Array.isArray(doc.roles) || (doc.roles as unknown[]).length === 0) {
      const legacy = doc.role as string | undefined;
      const roles: UserRole[] = [];
      if (
        legacy === "admin" ||
        legacy === "sub_admin" ||
        legacy === "staff" ||
        legacy === "advocate" ||
        legacy === "accountant"
      ) {
        roles.push(legacy);
      } else {
        roles.push("staff");
      }
      updates.roles = roles;
    }

    if (doc.designation === "Administration") {
      updates.designation = "Office Manager";
    }
    if (doc.designation === "Principal") {
      updates.designation = "Managing Partner";
    }

    if (Object.keys(updates).length === 0) continue;

    await prisma.$runCommandRaw({
      update: "User",
      updates: [
        {
          q: { _id: id },
          u: { $set: updates, $unset: { role: "" } },
        } as never,
      ],
    });
    migrated += 1;
  }

  if (seq > 0) {
    await prisma.idCounter.upsert({
      where: { entity: "employee" },
      create: { entity: "employee", seq },
      update: { seq },
    });
  }

  console.log(`User migrate: updated ${migrated} document(s), employee seq=${seq}`);
}

/**
 * Wipe operational data. Keeps RolePermission and the env bootstrap admin user.
 * Resets IdCounter so unit IDs start fresh after reseed.
 */
async function wipeKeepAdmin() {
  const adminMobile = normalizeMobile(
    process.env.ADMIN_MOBILE ?? process.env.ADMIN_MOBILE_1 ?? ""
  );
  if (!adminMobile) {
    throw new Error("--wipe-keep-admin requires ADMIN_MOBILE (or ADMIN_MOBILE_1)");
  }

  const counts = await Promise.all([
    prisma.hearing.deleteMany({}),
    prisma.case.deleteMany({}),
    prisma.cashPayment.deleteMany({}),
    prisma.officeExpense.deleteMany({}),
    prisma.document.deleteMany({}),
    prisma.appointment.deleteMany({}),
    prisma.dakEntry.deleteMany({}),
    prisma.officeTask.deleteMany({}),
    prisma.attendance.deleteMany({}),
    prisma.leaveRequest.deleteMany({}),
    prisma.advocateWeeklyHours.deleteMany({}),
    prisma.advocateTimeBlock.deleteMany({}),
    prisma.officeHoliday.deleteMany({}),
    prisma.notification.deleteMany({}),
    prisma.client.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.otpSession.deleteMany({}),
    prisma.consumedOtpProof.deleteMany({}),
    prisma.rateLimit.deleteMany({}),
  ]);

  const deletedUsers = await prisma.user.deleteMany({
    where: { mobile: { not: adminMobile } },
  });

  await prisma.idCounter.deleteMany({});

  // Keep employee seq above the remaining admin so new EMP-* IDs do not collide.
  const admin = await prisma.user.findUnique({
    where: { mobile: adminMobile },
    select: { unitId: true },
  });
  const adminSeq = Number(admin?.unitId?.match(/(\d+)$/)?.[1] ?? "0");
  if (adminSeq > 0) {
    await prisma.idCounter.create({
      data: { entity: "employee", seq: adminSeq },
    });
  }

  console.log(
    `--wipe-keep-admin: cleared business collections (${counts.reduce((a, c) => a + c.count, 0)} docs), deleted ${deletedUsers.count} user(s); kept admin ${adminMobile}`
  );
}

async function seedAdmin() {
  const adminMobile = normalizeMobile(
    process.env.ADMIN_MOBILE ?? process.env.ADMIN_MOBILE_1 ?? ""
  );
  if (!adminMobile) {
    console.log("Admin: skipped (set ADMIN_MOBILE)");
    return null;
  }

  const pinHash = await hashPin(SEED_PIN);
  const existing = await prisma.user.findUnique({ where: { mobile: adminMobile } });

  // Merge admin into existing roles — never wipe advocate/staff from a matched employee.
  // Bootstrap / Managing Partner also gets advocate so they appear in booking lists.
  const existingRoles = existing?.roles ?? [];
  const managingPartnerDefaults =
    !existing?.designation || existing.designation === "Managing Partner"
      ? designationDefaultRoles["Managing Partner"]
      : [];
  const mergedRoles = Array.from(
    new Set<UserRole>([...existingRoles, ...managingPartnerDefaults, "admin"])
  );

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        roles: mergedRoles,
        designation: existing.designation ?? "Managing Partner",
        name: existing.name ?? "Bootstrap Admin",
        pinHash,
        isActive: true,
        failedPinAttempts: 0,
        pinLockedUntil: null,
      },
    });
    console.log(`Admin: updated ${updated.unitId} (${adminMobile}) PIN=${SEED_PIN}`);
    return updated;
  }

  const unitId = await nextUnitId("employee");
  const created = await prisma.user.create({
    data: {
      unitId,
      mobile: adminMobile,
      roles: designationDefaultRoles["Managing Partner"],
      designation: "Managing Partner",
      name: "Bootstrap Admin",
      pinHash,
      isActive: true,
    },
  });
  console.log(`Admin: created ${created.unitId} (${adminMobile}) PIN=${SEED_PIN}`);
  return created;
}

async function seedEmployees(pinHash: string) {
  const adminMobile = normalizeMobile(
    process.env.ADMIN_MOBILE ?? process.env.ADMIN_MOBILE_1 ?? ""
  );
  let created = 0;
  let updated = 0;
  const rosterMobiles = new Set<string>();

  for (const row of OFFICE_ROSTER) {
    const mobile = normalizeMobile(row.mobile);
    if (!mobile) continue;
    rosterMobiles.add(mobile);

    const designation =
      normalizeDesignation(row.designation) ?? ("Advocate" as const);
    const baseRoles = designationDefaultRoles[designation];
    const forced = (row.forceRoles ?? []) as UserRole[];
    const existing = await prisma.user.findUnique({ where: { mobile } });
    const preserved = (existing?.roles ?? []).filter(
      (r) => r === "admin" || r === "sub_admin"
    );
    if (adminMobile && mobile === adminMobile && !preserved.includes("admin")) {
      preserved.push("admin");
    }
    const roles = Array.from(
      new Set<UserRole>([...preserved, ...baseRoles, ...forced])
    );

    const defaultCourts = row.defaultCourts;

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: row.name,
          designation,
          roles,
          email: row.email ?? null,
          address: row.address ?? null,
          defaultCourts,
          pinHash: existing.pinHash ?? pinHash,
          isActive: true,
        },
      });
      updated += 1;
      continue;
    }

    const unitId = await nextUnitId("employee");
    await prisma.user.create({
      data: {
        unitId,
        mobile,
        name: row.name,
        designation,
        roles,
        email: row.email,
        address: row.address,
        defaultCourts,
        pinHash,
        isActive: true,
      },
    });
    created += 1;
  }

  if (RESET_STAFF) {
    const others = await prisma.user.findMany({
      where: { mobile: { notIn: [...rosterMobiles] } },
      select: { id: true, mobile: true, unitId: true },
    });
    // Keep env bootstrap admin active even if not on roster yet.
    let deactivated = 0;
    for (const u of others) {
      if (adminMobile && u.mobile === adminMobile) continue;
      await prisma.user.update({
        where: { id: u.id },
        data: { isActive: false },
      });
      deactivated += 1;
    }
    console.log(
      `Employees: created ${created}, updated ${updated}, deactivated ${deactivated} (--reset-staff)`
    );
  } else {
    console.log(`Employees: created ${created}, updated ${updated}`);
  }
}

async function seedClients() {
  const rows = loadCsv("clients.sample.csv");
  const byKey = new Map<string, { id: string; unitId: string }>();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const mobile = normalizeMobile(row.mobile ?? "");
    if (!mobile) continue;

    const data = {
      name: row.name || "Client",
      fatherOrSpouse: row.fatherOrSpouse || undefined,
      occupation: row.occupation || undefined,
      gender: row.gender || undefined,
      mobile,
      altMobile: row.altMobile
        ? normalizeMobile(row.altMobile) ?? row.altMobile
        : undefined,
      email: row.email || undefined,
      address: row.address || undefined,
      city: row.city || undefined,
      district: row.district || undefined,
      state: row.state || undefined,
      aadhaarLast4: row.aadhaarLast4 || undefined,
      referredBy: row.referredBy || undefined,
      matterBrief: row.matterBrief || undefined,
      notes: row.notes || undefined,
      smsConsent: row.smsConsent?.toLowerCase() !== "false",
    };

    const existingByUnit = row.unitId?.trim()
      ? await prisma.client.findUnique({ where: { unitId: row.unitId.trim() } })
      : null;
    const existingByMobile = await prisma.client.findFirst({ where: { mobile } });
    const existing = existingByUnit ?? existingByMobile;

    let client;
    if (existing) {
      client = await prisma.client.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    } else {
      const unitId = await nextUnitId("client");
      client = await prisma.client.create({ data: { ...data, unitId } });
      created += 1;
    }

    byKey.set(mobile, { id: client.id, unitId: client.unitId });
    byKey.set(client.unitId, { id: client.id, unitId: client.unitId });
    if (row.unitId?.trim()) {
      byKey.set(row.unitId.trim(), { id: client.id, unitId: client.unitId });
    }
  }

  console.log(`Clients: created ${created}, updated ${updated}`);
  return byKey;
}

async function seedCases(
  clients: Map<string, { id: string; unitId: string }>
) {
  const rows = loadCsv("cases.sample.csv");
  const byKey = new Map<string, { id: string; unitId: string }>();
  let created = 0;
  let updated = 0;

  // Prefer real advocate mobiles from seeded employees when CSV uses placeholders.
  const advocates = await prisma.user.findMany({
    where: { roles: { has: "advocate" }, isActive: true },
    select: { mobile: true },
    take: 5,
  });
  const fallbackAdvocate = advocates[0]?.mobile;

  for (const row of rows) {
    const client =
      (row.clientMobile && clients.get(normalizeMobile(row.clientMobile) ?? "")) ||
      (row.clientUnitId && clients.get(row.clientUnitId.trim())) ||
      null;
    if (!client) {
      console.warn(
        `Case skip: client not found (mobile=${row.clientMobile} unitId=${row.clientUnitId})`
      );
      continue;
    }

    let advocateMobiles = row.advocateMobiles
      ? row.advocateMobiles
          .split(";")
          .map((m) => normalizeMobile(m.trim()) ?? m.trim())
          .filter(Boolean)
      : [];
    if (advocateMobiles.length === 0 && fallbackAdvocate) {
      advocateMobiles = [fallbackAdvocate];
    }

    let primary =
      normalizeMobile(row.primaryAdvocateMobile ?? "") ??
      row.primaryAdvocateMobile?.trim() ??
      advocateMobiles[0];
    if (
      primary &&
      !advocates.some((a) => a.mobile === primary) &&
      fallbackAdvocate
    ) {
      primary = fallbackAdvocate;
      if (!advocateMobiles.includes(fallbackAdvocate)) {
        advocateMobiles = [fallbackAdvocate, ...advocateMobiles];
      }
    }

    const status = normalizeCaseStatus(
      row.status?.trim() || "enquiry"
    ) as CaseStatus;

    const shared = {
      clientId: client.id,
      clientUnitId: client.unitId,
      caseNumber: row.caseNumber || undefined,
      cnr: row.cnr || undefined,
      state: row.state || undefined,
      district: row.district || undefined,
      city: row.city || undefined,
      courtName: row.courtName || undefined,
      advocateMobiles,
      primaryAdvocateMobile: primary || undefined,
      opposingParty: row.opposingParty || undefined,
      caseType: row.caseType || undefined,
      status,
      filingDate: parseDay(row.filingDate),
      nextHearingAt: parseDay(row.nextHearingAt),
      agreedFee: row.agreedFee ? Number(row.agreedFee) : undefined,
      notes: row.notes || undefined,
    };

    const existing = row.unitId?.trim()
      ? await prisma.case.findUnique({ where: { unitId: row.unitId.trim() } })
      : row.caseNumber
        ? await prisma.case.findFirst({ where: { caseNumber: row.caseNumber } })
        : await prisma.case.findFirst({
            where: {
              clientId: client.id,
              notes: row.notes || undefined,
            },
          });

    if (existing) {
      const c = await prisma.case.update({
        where: { id: existing.id },
        data: shared,
      });
      byKey.set(c.unitId, { id: c.id, unitId: c.unitId });
      if (c.caseNumber) byKey.set(c.caseNumber, { id: c.id, unitId: c.unitId });
      updated += 1;
      continue;
    }

    const unitId = await nextUnitId("case");
    const c = await prisma.case.create({ data: { ...shared, unitId } });
    byKey.set(c.unitId, { id: c.id, unitId: c.unitId });
    if (c.caseNumber) byKey.set(c.caseNumber, { id: c.id, unitId: c.unitId });
    // Also alias CSV unitId labels (e.g. CSE-00001) used by other sample files
    if (row.unitId?.trim()) {
      byKey.set(row.unitId.trim(), { id: c.id, unitId: c.unitId });
    }
    created += 1;
  }

  console.log(`Cases: created ${created}, updated ${updated}`);
  return byKey;
}

async function seedHearings(
  cases: Map<string, { id: string; unitId: string }>
) {
  const rows = loadCsv("hearings.sample.csv");
  let created = 0;

  for (const row of rows) {
    const c =
      (row.caseUnitId && cases.get(row.caseUnitId.trim())) ||
      (row.caseNumber && cases.get(row.caseNumber.trim())) ||
      null;
    if (!c) {
      console.warn(
        `Hearing skip: case not found (${row.caseUnitId || row.caseNumber})`
      );
      continue;
    }
    const hearingDate = parseDay(row.hearingDate);
    if (!hearingDate) continue;

    const existing = await prisma.hearing.findFirst({
      where: { caseId: c.id, hearingDate },
    });
    if (existing) continue;

    await prisma.hearing.create({
      data: {
        unitId: await nextUnitId("hearing"),
        caseId: c.id,
        caseUnitId: c.unitId,
        hearingDate,
        purpose: row.purpose || undefined,
        notes: row.notes || undefined,
      },
    });
    created += 1;
  }

  console.log(`Hearings: created ${created}`);
}

async function seedAppointments(
  clients: Map<string, { id: string; unitId: string }>
) {
  const rows = loadCsv("appointments.sample.csv");
  let created = 0;

  for (const row of rows) {
    const mobile = normalizeMobile(row.clientMobile ?? "");
    const client = mobile ? clients.get(mobile) : undefined;
    const scheduledAt = parseRelativeSlot(row.scheduledAt ?? "");
    if (!scheduledAt) continue;

    const advocateMobile =
      normalizeMobile(row.advocateMobile ?? "") ??
      (row.advocateMobile?.trim() || undefined);

    const existing = await prisma.appointment.findFirst({
      where: {
        title: row.title || "Appointment",
        scheduledAt,
        clientId: client?.id,
      },
    });
    if (existing) continue;

    await prisma.appointment.create({
      data: {
        unitId: await nextUnitId("appointment"),
        clientId: client?.id,
        clientUnitId: client?.unitId,
        advocateMobile,
        title: row.title || "Appointment",
        scheduledAt,
        durationMin: row.durationMin ? Number(row.durationMin) : 30,
        mode: row.mode || "office",
        location: row.location || undefined,
        notes: row.notes || undefined,
        status: "scheduled",
      },
    });
    created += 1;
  }

  console.log(`Appointments: created ${created}`);
}

async function seedPayments(
  clients: Map<string, { id: string; unitId: string }>,
  cases: Map<string, { id: string; unitId: string }>
) {
  const rows = loadCsv("payments.sample.csv");
  let created = 0;

  for (const row of rows) {
    const client =
      (row.clientMobile &&
        clients.get(normalizeMobile(row.clientMobile) ?? "")) ||
      (row.clientUnitId && clients.get(row.clientUnitId.trim())) ||
      null;
    if (!client) {
      console.warn(`Payment skip: client not found`);
      continue;
    }

    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;

    const type = (row.type?.trim() || "other") as PaymentType;
    const status = (row.status?.trim() || "pending") as PaymentStatus;
    const caseRef =
      (row.caseUnitId && cases.get(row.caseUnitId.trim())) ||
      (row.caseNumber && cases.get(row.caseNumber.trim())) ||
      null;

    const existing = await prisma.cashPayment.findFirst({
      where: {
        clientId: client.id,
        amount,
        type,
        notes: row.notes || undefined,
      },
    });
    if (existing) continue;

    await prisma.cashPayment.create({
      data: {
        unitId: await nextUnitId("payment"),
        clientId: client.id,
        clientUnitId: client.unitId,
        caseId: caseRef?.id,
        caseUnitId: caseRef?.unitId,
        type,
        amount,
        status,
        paidOn: parseDay(row.paidOn),
        notes: row.notes || undefined,
      },
    });
    created += 1;
  }

  console.log(`Payments: created ${created}`);
}

async function seedOfficeHoliday() {
  const year = new Date().getFullYear();
  const fromDate = `${year}-01-26`;
  const existing = await prisma.officeHoliday.findFirst({
    where: { title: "Republic Day", fromDate },
  });
  if (existing) {
    console.log("OfficeHoliday: already present");
    return;
  }
  await prisma.officeHoliday.create({
    data: {
      unitId: await nextUnitId("holiday"),
      title: "Republic Day",
      fromDate,
      toDate: fromDate,
      notes: "Seeded for testing",
    },
  });
  console.log("OfficeHoliday: created Republic Day");
}

async function printSummary() {
  const [users, clients, cases, hearings, appointments, payments, perms] =
    await Promise.all([
      prisma.user.count(),
      prisma.client.count(),
      prisma.case.count(),
      prisma.hearing.count(),
      prisma.appointment.count(),
      prisma.cashPayment.count(),
      prisma.rolePermission.count(),
    ]);
  console.log("\n--- Seed summary ---");
  console.log(
    JSON.stringify(
      { users, clients, cases, hearings, appointments, payments, perms },
      null,
      2
    )
  );
  console.log(`Test login: ADMIN_MOBILE with PIN ${SEED_PIN}`);
}

async function main() {
  if (WIPE_KEEP_ADMIN) {
    await wipeKeepAdmin();
  }
  await seedPermissions();
  await migrateLegacyUsers();
  const pinHash = await hashPin(SEED_PIN);
  await seedAdmin();
  await seedEmployees(pinHash);
  // After a wipe, only restore office staff — skip demo clients/cases/etc.
  if (!WIPE_KEEP_ADMIN) {
    const clients = await seedClients();
    const cases = await seedCases(clients);
    await seedHearings(cases);
    await seedAppointments(clients);
    await seedPayments(clients, cases);
    await seedOfficeHoliday();
  } else {
    console.log("Sample CSV data skipped (--wipe-keep-admin)");
  }
  await printSummary();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
