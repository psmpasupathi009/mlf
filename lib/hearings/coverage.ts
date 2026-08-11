import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { normalizeMobile } from "@/lib/auth/mobile";
import {
  assertAdvocateCourtDayAvailable,
  clashMessage,
  mobileLookupVariants,
} from "@/lib/hearings/advocate-day";
import {
  courtKey,
  effectiveHearingAdvocate,
  parseDefaultCourts,
} from "@/lib/hearings/court-key";
import { istDateKey, istDayBounds } from "@/lib/utils/ist";
import { notifyCoverageEvent } from "@/lib/hearings/coverage-notify";

export type CoverageReason = "leave" | "unavailable_block" | "other";

/** Suggest advocates whose defaultCourts include case court and who pass clash guard. */
export async function suggestCoveringAdvocates(input: {
  hearingDate: Date;
  court: {
    state?: string | null;
    district?: string | null;
    city?: string | null;
    courtName?: string | null;
  };
  excludeMobile?: string | null;
  excludeHearingId?: string;
}): Promise<string[]> {
  const target = courtKey(input.court);
  const exclude = normalizeMobile(input.excludeMobile ?? "") ?? "";
  const advocates = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { has: "advocate" },
    },
    select: { mobile: true, defaultCourts: true },
  });

  const suggested: string[] = [];
  for (const a of advocates) {
    if (exclude && a.mobile === exclude) continue;
    const courts = parseDefaultCourts(a.defaultCourts);
    const matches = courts.some((c) => courtKey(c) === target);
    if (!matches && target) {
      const city = (input.court.city ?? "").trim().toLowerCase();
      if (
        !city ||
        !courts.some((c) => c.city.trim().toLowerCase() === city)
      ) {
        continue;
      }
    }
    const check = await assertAdvocateCourtDayAvailable({
      advocateMobile: a.mobile,
      hearingDate: input.hearingDate,
      court: input.court,
      excludeHearingId: input.excludeHearingId,
    });
    if (check.ok) suggested.push(a.mobile);
  }
  return suggested;
}

/** Upsert one open coverage item per hearing. */
export async function enqueueHearingCoverage(input: {
  hearingId: string;
  reason: CoverageReason;
  reasonNote?: string;
  sourceLeaveId?: string;
  sourceBlockId?: string;
  createdById?: string;
  notify?: boolean;
}): Promise<{ unitId: string; created: boolean } | null> {
  const hearing = await prisma.hearing.findUnique({
    where: { id: input.hearingId },
  });
  if (!hearing || hearing.isAdjourned) return null;

  const cse = await prisma.case.findUnique({
    where: { unitId: hearing.caseUnitId },
  });
  if (!cse) return null;

  const original =
    normalizeMobile(cse.primaryAdvocateMobile ?? "") ??
    cse.primaryAdvocateMobile ??
    "";
  if (!original) return null;

  const existing = await prisma.hearingCoverageItem.findFirst({
    where: { hearingId: hearing.id, status: "open" },
  });
  if (existing) {
    return { unitId: existing.unitId, created: false };
  }

  const suggested = await suggestCoveringAdvocates({
    hearingDate: hearing.hearingDate,
    court: cse,
    excludeMobile: original,
    excludeHearingId: hearing.id,
  });

  const unitId = await nextUnitId("coverage");
  const row = await prisma.hearingCoverageItem.create({
    data: {
      unitId,
      hearingId: hearing.id,
      hearingUnitId: hearing.unitId,
      caseUnitId: hearing.caseUnitId,
      originalAdvocateMobile: original,
      hearingDate: hearing.hearingDate,
      reason: input.reason,
      reasonNote: input.reasonNote || undefined,
      sourceLeaveId: input.sourceLeaveId,
      sourceBlockId: input.sourceBlockId,
      status: "open",
      suggestedMobiles: suggested,
      createdById: input.createdById,
    },
  });

  if (input.notify !== false) {
    await notifyCoverageEvent({
      kind: "opened",
      caseUnitId: cse.unitId,
      caseLabel: cse.caseNumber || cse.filingNumber || cse.unitId,
      courtName: cse.courtName,
      hearingDate: hearing.hearingDate,
      originalMobile: original,
      reason: input.reason,
      reasonNote: input.reasonNote,
      href: `/diary?date=${istDateKey(hearing.hearingDate)}`,
    });
  }

  return { unitId: row.unitId, created: true };
}

/** Enqueue coverage for all future hearings of an advocate in a date range. */
export async function enqueueCoverageForAdvocateRange(input: {
  advocateMobile: string;
  fromDate: string;
  toDate: string;
  reason: CoverageReason;
  sourceLeaveId?: string;
  sourceBlockId?: string;
  createdById?: string;
}): Promise<number> {
  const mobile = normalizeMobile(input.advocateMobile);
  if (!mobile) return 0;

  const from = istDayBounds(input.fromDate).start;
  const to = istDayBounds(input.toDate).end;
  const mobiles = mobileLookupVariants(mobile);

  const primaryCases = await prisma.case.findMany({
    where: { primaryAdvocateMobile: { in: mobiles } },
    select: { unitId: true, primaryAdvocateMobile: true },
  });

  const coveredHearings = await prisma.hearing.findMany({
    where: {
      coveringAdvocateMobile: { in: mobiles },
      isAdjourned: false,
      hearingDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      caseUnitId: true,
      coveringAdvocateMobile: true,
    },
  });

  const caseUnitIds = new Set([
    ...primaryCases.map((c) => c.unitId),
    ...coveredHearings.map((h) => h.caseUnitId),
  ]);
  if (caseUnitIds.size === 0) return 0;

  const missingCaseIds = [...caseUnitIds].filter(
    (id) => !primaryCases.some((c) => c.unitId === id)
  );
  const extraCases =
    missingCaseIds.length === 0
      ? []
      : await prisma.case.findMany({
          where: { unitId: { in: missingCaseIds } },
          select: { unitId: true, primaryAdvocateMobile: true },
        });

  const caseByUnit = new Map(
    [...primaryCases, ...extraCases].map((c) => [c.unitId, c])
  );

  const hearings = await prisma.hearing.findMany({
    where: {
      caseUnitId: { in: [...caseUnitIds] },
      isAdjourned: false,
      hearingDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      caseUnitId: true,
      coveringAdvocateMobile: true,
    },
  });

  let n = 0;
  for (const h of hearings) {
    const cse = caseByUnit.get(h.caseUnitId);
    const effective = effectiveHearingAdvocate({
      coveringAdvocateMobile: h.coveringAdvocateMobile,
      primaryAdvocateMobile: cse?.primaryAdvocateMobile ?? null,
    });
    if (normalizeMobile(effective ?? "") !== mobile) continue;

    const r = await enqueueHearingCoverage({
      hearingId: h.id,
      reason: input.reason,
      sourceLeaveId: input.sourceLeaveId,
      sourceBlockId: input.sourceBlockId,
      createdById: input.createdById,
    });
    if (r?.created) n += 1;
  }
  return n;
}

export async function dismissOpenCoverageForLeave(leaveId: string) {
  const open = await prisma.hearingCoverageItem.findMany({
    where: { sourceLeaveId: leaveId, status: "open" },
  });
  if (open.length > 0) {
    await prisma.hearingCoverageItem.updateMany({
      where: { sourceLeaveId: leaveId, status: "open" },
      data: { status: "dismissed", resolvedAt: new Date() },
    });

    for (const item of open) {
      await notifyCoverageEvent({
        kind: "leave_cleared",
        caseUnitId: item.caseUnitId,
        caseLabel: item.caseUnitId,
        hearingDate: item.hearingDate,
        originalMobile: item.originalAdvocateMobile,
        reason: "leave",
        href: `/cases/${item.caseUnitId}`,
      });
    }
  }

  // Leave cancelled → primary is available again; drop date-specific covers
  // that were assigned because of this leave.
  const covered = await prisma.hearingCoverageItem.findMany({
    where: { sourceLeaveId: leaveId, status: "covered" },
    select: { hearingId: true, id: true },
  });
  if (covered.length > 0) {
    await prisma.hearing.updateMany({
      where: { id: { in: covered.map((c) => c.hearingId) } },
      data: { coveringAdvocateMobile: null },
    });
    await prisma.hearingCoverageItem.updateMany({
      where: { id: { in: covered.map((c) => c.id) } },
      data: {
        status: "dismissed",
        resolvedAt: new Date(),
        notes: "Cleared — leave cancelled",
      },
    });
  }
}

export async function dismissOpenCoverageForBlock(blockId: string) {
  const open = await prisma.hearingCoverageItem.findMany({
    where: { sourceBlockId: blockId, status: "open" },
  });
  if (open.length === 0) return;

  await prisma.hearingCoverageItem.updateMany({
    where: { sourceBlockId: blockId, status: "open" },
    data: { status: "dismissed", resolvedAt: new Date() },
  });

  for (const item of open) {
    await notifyCoverageEvent({
      kind: "dismissed",
      caseUnitId: item.caseUnitId,
      caseLabel: item.caseUnitId,
      hearingDate: item.hearingDate,
      originalMobile: item.originalAdvocateMobile,
      reason: "unavailable_block",
      href: `/cases/${item.caseUnitId}`,
    });
  }
}

export async function dismissStaleOpenCoverage() {
  const today = istDateKey(new Date());
  const { start } = istDayBounds(today);
  await prisma.hearingCoverageItem.updateMany({
    where: { status: "open", hearingDate: { lt: start } },
    data: { status: "dismissed", resolvedAt: new Date() },
  });
}

export { clashMessage, effectiveHearingAdvocate };
