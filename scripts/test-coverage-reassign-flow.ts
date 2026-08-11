/**
 * Integration smoke: defaultCourts suggest → cover → permanent reassign.
 * Run: npx tsx scripts/test-coverage-reassign-flow.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalizeMobile } from "../lib/auth/mobile";
import { nextUnitId } from "../lib/ids";
import {
  enqueueHearingCoverage,
  suggestCoveringAdvocates,
} from "../lib/hearings/coverage";
import { effectiveHearingAdvocate } from "../lib/hearings/court-key";
import {
  assertAdvocateCourtDayAvailable,
  clashMessage,
} from "../lib/hearings/advocate-day";
import { istDayBounds, istDateKey } from "../lib/utils/ist";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const ajith = normalizeMobile("9786570408")!;
  const subha = normalizeMobile("6379614984")!;
  const vairal = normalizeMobile("8760228622")!;

  const court = {
    state: "Tamil Nadu",
    district: "Erode",
    city: "Gobichettipalayam",
    courtName: "District Munsif Court, Gobichettipalayam",
  };

  console.log("1) Suggest covers for Gobi DM (exclude Vairal)…");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  const dayKey = istDateKey(tomorrow);
  const hearingDate = istDayBounds(dayKey).start;

  const suggested = await suggestCoveringAdvocates({
    hearingDate,
    court,
    excludeMobile: vairal,
  });
  console.log(
    "   suggested:",
    suggested.map((m) => m.slice(-10)).join(", ") || "(none)"
  );
  assert(
    suggested.includes(ajith),
    "Ajith (default court = Gobi DM) should be suggested"
  );

  console.log("2) Create temp client / case / hearing…");
  const clientUnitId = await nextUnitId("client");
  const client = await prisma.client.create({
    data: {
      unitId: clientUnitId,
      name: "Coverage Flow Test Client",
      mobile: "919999990001",
    },
  });

  const caseUnitId = await nextUnitId("case");
  const cse = await prisma.case.create({
    data: {
      unitId: caseUnitId,
      clientId: client.id,
      clientUnitId: client.unitId,
      caseNumber: `TEST-COV-${Date.now()}`,
      ...court,
      primaryAdvocateMobile: vairal,
      advocateMobiles: [vairal],
      status: "pending",
      nextHearingAt: hearingDate,
    },
  });

  const hearingUnitId = await nextUnitId("hearing");
  const hearing = await prisma.hearing.create({
    data: {
      unitId: hearingUnitId,
      caseId: cse.id,
      caseUnitId: cse.unitId,
      hearingDate,
      purpose: "Coverage flow test",
    },
  });

  console.log("3) Enqueue coverage…");
  const enq = await enqueueHearingCoverage({
    hearingId: hearing.id,
    reason: "leave",
    reasonNote: "integration test",
    notify: false,
  });
  assert(enq?.created, "coverage item should be created");
  const item = await prisma.hearingCoverageItem.findUnique({
    where: { unitId: enq!.unitId },
  });
  assert(item?.status === "open", "coverage open");
  assert(
    item!.suggestedMobiles.includes(ajith),
    "suggestedMobiles includes Ajith"
  );

  console.log("4) Cover with Ajith (date-specific)…");
  const coverCheck = await assertAdvocateCourtDayAvailable({
    advocateMobile: ajith,
    hearingDate,
    court,
    excludeHearingId: hearing.id,
  });
  assert(coverCheck.ok, clashMessage(coverCheck));

  await prisma.$transaction([
    prisma.hearing.update({
      where: { id: hearing.id },
      data: { coveringAdvocateMobile: ajith },
    }),
    prisma.hearingCoverageItem.update({
      where: { id: item!.id },
      data: {
        status: "covered",
        coveringMobile: ajith,
        resolvedAt: new Date(),
      },
    }),
  ]);

  const afterCover = await prisma.hearing.findUnique({
    where: { id: hearing.id },
  });
  assert(
    effectiveHearingAdvocate({
      coveringAdvocateMobile: afterCover!.coveringAdvocateMobile,
      primaryAdvocateMobile: cse.primaryAdvocateMobile,
    }) === ajith,
    "effective advocate after cover = Ajith"
  );
  console.log("   effective advocate = Ajith (cover) OK");

  console.log("5) Permanent reassign to Subhakannan…");
  const reassignCheck = await assertAdvocateCourtDayAvailable({
    advocateMobile: subha,
    hearingDate,
    court,
    excludeHearingId: hearing.id,
  });
  // Subha default court is Subordinate, not DM — clash guard is day/court based,
  // not defaultCourts. He can still take reassign if free that day.
  assert(reassignCheck.ok, clashMessage(reassignCheck));

  const todayStart = istDayBounds(istDateKey()).start;
  await prisma.$transaction([
    prisma.case.update({
      where: { id: cse.id },
      data: {
        primaryAdvocateMobile: subha,
        advocateMobiles: [vairal, ajith, subha],
      },
    }),
    prisma.hearing.updateMany({
      where: {
        caseUnitId: cse.unitId,
        isAdjourned: false,
        hearingDate: { gte: todayStart },
      },
      data: { coveringAdvocateMobile: null },
    }),
    prisma.hearingCoverageItem.update({
      where: { id: item!.id },
      data: {
        status: "permanently_reassigned",
        coveringMobile: subha,
        resolvedAt: new Date(),
      },
    }),
  ]);

  const cse2 = await prisma.case.findUnique({ where: { id: cse.id } });
  const h2 = await prisma.hearing.findUnique({ where: { id: hearing.id } });
  const item2 = await prisma.hearingCoverageItem.findUnique({
    where: { id: item!.id },
  });

  assert(cse2!.primaryAdvocateMobile === subha, "primary = Subhakannan");
  assert(
    h2!.coveringAdvocateMobile == null,
    "covering cleared after permanent reassign"
  );
  assert(
    item2!.status === "permanently_reassigned",
    "coverage status permanently_reassigned"
  );
  assert(
    effectiveHearingAdvocate({
      coveringAdvocateMobile: h2!.coveringAdvocateMobile,
      primaryAdvocateMobile: cse2!.primaryAdvocateMobile,
    }) === subha,
    "effective advocate after reassign = Subhakannan"
  );
  console.log("   primary = Subhakannan, covering cleared OK");

  console.log("6) Cleanup temp records…");
  await prisma.hearingCoverageItem.deleteMany({
    where: { caseUnitId: cse.unitId },
  });
  await prisma.hearing.deleteMany({ where: { caseUnitId: cse.unitId } });
  await prisma.case.delete({ where: { id: cse.id } });
  await prisma.client.delete({ where: { id: client.id } });

  console.log("\nALL COVERAGE / REASSIGN CHECKS PASSED");
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
