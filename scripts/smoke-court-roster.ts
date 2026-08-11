/**
 * Smoke-test court roster data + helper flow against live DB.
 * Run: npx tsx scripts/smoke-court-roster.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  buildCourtRosterForDate,
  findAdvocateDutyClash,
  findOverlappingOverride,
  parseAdvocateDefaults,
  resolveEndOverride,
} from "../features/court-roster/lib/effective-cover";
import { courtKey } from "../lib/hearings/court-key";
import { istDateKey, istAddCalendarDays } from "../lib/utils/ist";
import { nextUnitId } from "../lib/ids";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("1) Prisma model present…");
  assert(typeof prisma.courtDutyOverride?.findMany === "function", "courtDutyOverride missing — run prisma generate");

  const today = istDateKey();
  console.log("2) Load advocates + build roster for", today);

  const advocates = await prisma.user.findMany({
    where: { isActive: true, roles: { has: "advocate" } },
    select: {
      id: true,
      unitId: true,
      name: true,
      mobile: true,
      defaultCourts: true,
    },
  });
  console.log(`   advocates: ${advocates.length}`);

  const overridesBefore = await prisma.courtDutyOverride.findMany();
  console.log(`   existing overrides: ${overridesBefore.length}`);

  const roster = buildCourtRosterForDate({
    date: today,
    advocates: advocates.map((a) => ({
      userId: a.id,
      unitId: a.unitId,
      mobile: a.mobile,
      name: a.name,
      displayName: a.name ?? a.unitId,
      defaultCourts: parseAdvocateDefaults(a.defaultCourts),
    })),
    overrides: overridesBefore.map((o) => ({
      ...o,
      advocateDisplayName: o.advocateMobile,
    })),
  });
  console.log(`   roster courts: ${roster.length}`);

  assert(advocates.length >= 1, "Need at least one advocate in DB to test create/end flow");

  const adv = advocates[0]!;
  const courts = parseAdvocateDefaults(adv.defaultCourts);
  const court =
    courts[0] ??
    ({
      state: "Tamil Nadu",
      district: "Erode",
      city: "Gobichettipalayam",
      courtName: "Smoke Test Court JM",
    } as const);

  const fromDate = istAddCalendarDays(today, 30);
  const toDate = istAddCalendarDays(today, 32);

  console.log("3) Overlap helpers…");
  assert(
    findOverlappingOverride([], { ...court, fromDate, toDate }) === null,
    "empty overlap should be null"
  );

  console.log("4) Create temporary override…");
  const unitId = await nextUnitId("courtDuty");
  const created = await prisma.courtDutyOverride.create({
    data: {
      unitId,
      ...court,
      advocateUserId: adv.id,
      advocateUnitId: adv.unitId,
      advocateMobile: adv.mobile,
      fromDate,
      toDate,
      reason: "smoke-test",
    },
  });
  console.log(`   created ${created.unitId}`);

  const clashSameCourt = findOverlappingOverride(
    [created],
    { ...court, fromDate, toDate }
  );
  assert(clashSameCourt?.unitId === created.unitId, "same-court overlap should hit");

  if (advocates[1]) {
    const otherCourt = {
      state: "Tamil Nadu",
      district: "Coimbatore",
      city: "Coimbatore",
      courtName: "Smoke Other Court",
    };
    const dutyClash = findAdvocateDutyClash(
      [
        {
          unitId: created.unitId,
          advocateUnitId: created.advocateUnitId,
          state: created.state,
          district: created.district,
          city: created.city,
          courtName: created.courtName,
          fromDate: created.fromDate,
          toDate: created.toDate,
        },
      ],
      {
        advocateUnitId: created.advocateUnitId,
        ...otherCourt,
        fromDate,
        toDate,
      }
    );
    assert(dutyClash, "same advocate two courts should clash");
    console.log("5) Advocate duty clash OK");
  } else {
    console.log("5) Skip duty clash (only one advocate)");
  }

  console.log("6) Roster includes override court…");
  const roster2 = buildCourtRosterForDate({
    date: fromDate,
    advocates: advocates.map((a) => ({
      userId: a.id,
      unitId: a.unitId,
      mobile: a.mobile,
      name: a.name,
      displayName: a.name ?? a.unitId,
      defaultCourts: parseAdvocateDefaults(a.defaultCourts),
    })),
    overrides: [
      {
        ...created,
        advocateDisplayName: adv.name ?? adv.unitId,
      },
    ],
  });
  const row = roster2.find((r) => courtKey(r) === courtKey(court));
  assert(row, "override court missing from roster");
  assert(row.activeOverride?.unitId === created.unitId, "override not active on date");
  assert(row.covering[0]?.unitId === adv.unitId, "covering advocate wrong");
  console.log(`   covering: ${row.covering[0]?.displayName}`);

  console.log("7) End future override (delete)…");
  const end = resolveEndOverride({
    fromDate: created.fromDate,
    toDate: created.toDate,
    today,
  });
  assert(end.action === "delete", "future cover should delete");
  await prisma.courtDutyOverride.delete({ where: { id: created.id } });
  const gone = await prisma.courtDutyOverride.findUnique({
    where: { unitId: created.unitId },
  });
  assert(!gone, "override still present after delete");

  console.log("8) Truncate path helper…");
  const trunc = resolveEndOverride({
    fromDate: istAddCalendarDays(today, -5),
    toDate: istAddCalendarDays(today, 5),
    today,
  });
  assert(trunc.action === "truncate", "active cover should truncate");
  assert(
    trunc.action === "truncate" && trunc.toDate === istAddCalendarDays(today, -1),
    "truncate toDate should be yesterday"
  );

  console.log("\nALL COURT ROSTER FLOW CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error("\nFAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
