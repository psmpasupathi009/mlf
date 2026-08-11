/**
 * Idempotent E2E fixtures for full-site flow testing.
 * Tagged names: "E2E Fixture …" — safe to re-run.
 *
 *   npx tsx scripts/seed-flow-fixtures.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalizeMobile } from "../lib/auth/mobile";
import { nextUnitId } from "../lib/ids";
import { istDayBounds, istDateKey } from "../lib/utils/ist";

const prisma = new PrismaClient();

const CLIENT_NAME = "E2E Fixture Client";
const CASE_GOBI = "E2E Fixture Case Gobi DM";
const CASE_ERODE = "E2E Fixture Case Erode PD";
const CLIENT_MOBILE = "919999991001";

const AJITH = normalizeMobile("9786570408")!;
const SURYA = normalizeMobile("9578042348")!;

const GOBI_COURT = {
  state: "Tamil Nadu",
  district: "Erode",
  city: "Gobichettipalayam",
  courtName: "District Munsif Court, Gobichettipalayam",
};

const ERODE_COURT = {
  state: "Tamil Nadu",
  district: "Erode",
  city: "Erode",
  courtName: "Principal District Court, Erode",
};

async function ensureClient() {
  const existing = await prisma.client.findFirst({
    where: { name: CLIENT_NAME },
  });
  if (existing) {
    console.log(`Client: reuse ${existing.unitId}`);
    return existing;
  }
  const unitId = await nextUnitId("client");
  const created = await prisma.client.create({
    data: {
      unitId,
      name: CLIENT_NAME,
      mobile: CLIENT_MOBILE,
      state: "Tamil Nadu",
      district: "Erode",
      city: "Gobichettipalayam",
      matterBrief: "E2E fixture — do not delete while testing",
      smsConsent: false,
    },
  });
  console.log(`Client: created ${created.unitId}`);
  return created;
}

async function ensureCase(
  client: { id: string; unitId: string },
  title: string,
  court: typeof GOBI_COURT,
  advocateMobile: string,
  hearingDaysAhead: number
) {
  let cse = await prisma.case.findFirst({
    where: { notes: title },
  });
  if (!cse) {
    const unitId = await nextUnitId("case");
    cse = await prisma.case.create({
      data: {
        unitId,
        clientId: client.id,
        clientUnitId: client.unitId,
        caseNumber: `E2E-${unitId}`,
        ...court,
        primaryAdvocateMobile: advocateMobile,
        advocateMobiles: [advocateMobile],
        caseType: "OS",
        caseYear: new Date().getFullYear(),
        ourSide: "petitioner",
        opposingParty: "E2E Opposing",
        notes: title,
        status: "pending",
      },
    });
    console.log(`Case: created ${cse.unitId} (${title})`);
  } else {
    console.log(`Case: reuse ${cse.unitId} (${title})`);
  }

  const day = new Date();
  day.setDate(day.getDate() + hearingDaysAhead);
  const dayKey = istDateKey(day);
  const hearingDate = istDayBounds(dayKey).start;

  const existingHearing = await prisma.hearing.findFirst({
    where: {
      caseUnitId: cse.unitId,
      isAdjourned: false,
      purpose: "E2E fixture hearing",
    },
  });
  if (existingHearing) {
    console.log(`Hearing: reuse ${existingHearing.unitId}`);
    return { cse, hearing: existingHearing };
  }

  const hearingUnitId = await nextUnitId("hearing");
  const hearing = await prisma.hearing.create({
    data: {
      unitId: hearingUnitId,
      caseId: cse.id,
      caseUnitId: cse.unitId,
      hearingDate,
      purpose: "E2E fixture hearing",
    },
  });
  await prisma.case.update({
    where: { id: cse.id },
    data: { nextHearingAt: hearingDate },
  });
  console.log(`Hearing: created ${hearing.unitId} on ${dayKey}`);
  return { cse, hearing };
}

async function main() {
  const ajith = await prisma.user.findUnique({ where: { mobile: AJITH } });
  const surya = await prisma.user.findUnique({ where: { mobile: SURYA } });
  if (!ajith || !surya) {
    throw new Error(
      "Roster advocates Ajith / Surya missing — run office roster seed first"
    );
  }

  const client = await ensureClient();
  const gobi = await ensureCase(client, CASE_GOBI, GOBI_COURT, AJITH, 5);
  const erode = await ensureCase(client, CASE_ERODE, ERODE_COURT, SURYA, 7);

  console.log("\nE2E fixtures ready:");
  console.log(`  client=${client.unitId}`);
  console.log(`  gobiCase=${gobi.cse.unitId} hearing=${gobi.hearing.unitId}`);
  console.log(`  erodeCase=${erode.cse.unitId} hearing=${erode.hearing.unitId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
