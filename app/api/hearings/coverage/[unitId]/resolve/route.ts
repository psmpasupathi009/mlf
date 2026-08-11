import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requireRole } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { resolveCoverageSchema } from "@/lib/validations/coverage.schema";
import {
  assertAdvocateCourtDayAvailable,
  clashMessage,
} from "@/lib/hearings/advocate-day";
import { notifyCoverageEvent } from "@/lib/hearings/coverage-notify";
import { courtKey } from "@/lib/hearings/court-key";
import { parseIstDateInput, istDateKey, istDayBounds, istDisplayDate } from "@/lib/utils/ist";

export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requireRole(request, ["admin", "sub_admin"]);
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.hearingCoverageItem.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Coverage item not found", 404);
  if (item.status !== "open") {
    return jsonFail("CONFLICT", "Coverage item is not open", 409);
  }

  const raw = await request.json();
  const parsed = resolveCoverageSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const input = parsed.data;

  const hearing = await prisma.hearing.findUnique({
    where: { id: item.hearingId },
  });
  const cse = await prisma.case.findUnique({
    where: { unitId: item.caseUnitId },
  });
  if (!hearing || !cse) {
    return jsonFail("NOT_FOUND", "Hearing or case missing", 404);
  }

  const caseLabel = cse.caseNumber || cse.filingNumber || cse.unitId;
  const hrefDiary = `/diary?date=${istDateKey(hearing.hearingDate)}`;

  if (input.action === "dismiss") {
    await prisma.hearingCoverageItem.update({
      where: { id: item.id },
      data: {
        status: "dismissed",
        notes: input.notes || undefined,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });
    await notifyCoverageEvent({
      kind: "dismissed",
      caseUnitId: cse.unitId,
      caseLabel,
      courtName: cse.courtName,
      hearingDate: hearing.hearingDate,
      originalMobile: item.originalAdvocateMobile,
      href: `/cases/${cse.unitId}`,
      actorUserId: user.id,
    });
    return jsonOk({ ok: true, status: "dismissed" });
  }

  if (input.action === "cover" || input.action === "cover_batch") {
    const toMobile = normalizeMobile(input.toMobile);
    if (!toMobile) {
      return jsonFail("VALIDATION", "Invalid advocate mobile", 400);
    }

    let batchTargets = [item];
    if (input.action === "cover_batch") {
      const openSameDay = await prisma.hearingCoverageItem.findMany({
        where: {
          status: "open",
          originalAdvocateMobile: item.originalAdvocateMobile,
          hearingDate: hearing.hearingDate,
        },
      });
      const sourceKey = courtKey(cse);
      batchTargets = [];
      for (const t of openSameDay) {
        const c = await prisma.case.findUnique({
          where: { unitId: t.caseUnitId },
          select: {
            state: true,
            district: true,
            city: true,
            courtName: true,
          },
        });
        if (c && courtKey(c) === sourceKey) batchTargets.push(t);
      }
    }

    const check = await assertAdvocateCourtDayAvailable({
      advocateMobile: toMobile,
      hearingDate: hearing.hearingDate,
      court: cse,
      excludeHearingId: hearing.id,
    });
    if (!check.ok) {
      return jsonFail("CONFLICT", clashMessage(check), 409);
    }

    for (const t of batchTargets) {
      const h = await prisma.hearing.findUnique({ where: { id: t.hearingId } });
      const c = await prisma.case.findUnique({ where: { unitId: t.caseUnitId } });
      if (!h || !c) continue;
      const dayCheck = await assertAdvocateCourtDayAvailable({
        advocateMobile: toMobile,
        hearingDate: h.hearingDate,
        court: c,
        excludeHearingId: h.id,
      });
      if (!dayCheck.ok) {
        return jsonFail("CONFLICT", clashMessage(dayCheck), 409);
      }
      await prisma.$transaction([
        prisma.hearing.update({
          where: { id: h.id },
          data: { coveringAdvocateMobile: toMobile },
        }),
        prisma.hearingCoverageItem.update({
          where: { id: t.id },
          data: {
            status: "covered",
            coveringMobile: toMobile,
            resolvedById: user.id,
            resolvedAt: new Date(),
          },
        }),
      ]);
    }

    await notifyCoverageEvent({
      kind: "covered",
      caseUnitId: cse.unitId,
      caseLabel,
      courtName: cse.courtName,
      hearingDate: hearing.hearingDate,
      originalMobile: item.originalAdvocateMobile,
      coveringMobile: toMobile,
      href: hrefDiary,
      actorUserId: user.id,
    });

    return jsonOk({ ok: true, status: "covered", count: batchTargets.length });
  }

  if (input.action === "reassign_permanent") {
    const toMobile = normalizeMobile(input.toMobile);
    if (!toMobile) {
      return jsonFail("VALIDATION", "Invalid advocate mobile", 400);
    }

    const todayStart = istDayBounds(istDateKey()).start;

    const future = await prisma.hearing.findMany({
      where: {
        caseUnitId: cse.unitId,
        isAdjourned: false,
        hearingDate: { gte: todayStart },
      },
    });
    for (const h of future) {
      const check = await assertAdvocateCourtDayAvailable({
        advocateMobile: toMobile,
        hearingDate: h.hearingDate,
        court: cse,
        excludeHearingId: h.id,
      });
      if (!check.ok) {
        return jsonFail(
          "CONFLICT",
          `${clashMessage(check)} on ${istDisplayDate(h.hearingDate)}`,
          409
        );
      }
    }

    const mobiles = Array.from(
      new Set([...(cse.advocateMobiles ?? []), toMobile, item.originalAdvocateMobile])
    );

    await prisma.$transaction([
      prisma.case.update({
        where: { id: cse.id },
        data: {
          primaryAdvocateMobile: toMobile,
          advocateMobiles: mobiles,
        },
      }),
      // Permanent reassign must win over date-specific covering
      prisma.hearing.updateMany({
        where: {
          caseUnitId: cse.unitId,
          isAdjourned: false,
          hearingDate: { gte: todayStart },
        },
        data: { coveringAdvocateMobile: null },
      }),
      prisma.hearingCoverageItem.updateMany({
        where: {
          caseUnitId: cse.unitId,
          status: "open",
          id: { not: item.id },
        },
        data: {
          status: "dismissed",
          resolvedAt: new Date(),
          resolvedById: user.id,
          notes: "Closed — permanent reassign",
        },
      }),
      prisma.hearingCoverageItem.update({
        where: { id: item.id },
        data: {
          status: "permanently_reassigned",
          coveringMobile: toMobile,
          resolvedById: user.id,
          resolvedAt: new Date(),
        },
      }),
    ]);

    await notifyCoverageEvent({
      kind: "reassigned",
      caseUnitId: cse.unitId,
      caseLabel,
      courtName: cse.courtName,
      hearingDate: hearing.hearingDate,
      originalMobile: item.originalAdvocateMobile,
      newPrimaryMobile: toMobile,
      href: `/cases/${cse.unitId}`,
      actorUserId: user.id,
    });

    return jsonOk({ ok: true, status: "permanently_reassigned" });
  }

  // adjourn
  const nextDate = parseIstDateInput(input.nextHearingDate);
  if (!nextDate) {
    return jsonFail("VALIDATION", "Invalid next hearing date", 400);
  }

  let coverMobile =
    normalizeMobile(input.toMobile || "") ||
    hearing.coveringAdvocateMobile ||
    cse.primaryAdvocateMobile;

  if (coverMobile) {
    const check = await assertAdvocateCourtDayAvailable({
      advocateMobile: coverMobile,
      hearingDate: nextDate,
      court: cse,
    });
    if (!check.ok) {
      return jsonFail("CONFLICT", clashMessage(check), 409);
    }
  }

  const newHearingUnitId = await nextUnitId("hearing");
  await prisma.$transaction([
    prisma.hearing.update({
      where: { id: hearing.id },
      data: {
        isAdjourned: true,
        outcome: input.outcome || "Adjourned",
        notes: input.notes || hearing.notes,
      },
    }),
    prisma.hearing.create({
      data: {
        unitId: newHearingUnitId,
        caseId: cse.id,
        caseUnitId: cse.unitId,
        hearingDate: nextDate,
        purpose: hearing.purpose,
        coveringAdvocateMobile: coverMobile || undefined,
        createdById: user.id,
      },
    }),
    prisma.case.update({
      where: { id: cse.id },
      data: { nextHearingAt: nextDate },
    }),
    prisma.hearingCoverageItem.update({
      where: { id: item.id },
      data: {
        status: "adjourned",
        coveringMobile: coverMobile || undefined,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    }),
  ]);

  await writeAudit({
    actorUnitId: user.unitId,
    action: "hearing.adjourn",
    entity: "Hearing",
    entityUnitId: hearing.unitId,
    meta: { nextHearingUnitId: newHearingUnitId, via: "coverage" },
  });

  await notifyCoverageEvent({
    kind: "adjourned",
    caseUnitId: cse.unitId,
    caseLabel,
    courtName: cse.courtName,
    hearingDate: nextDate,
    originalMobile: item.originalAdvocateMobile,
    coveringMobile: coverMobile,
    href: `/cases/${cse.unitId}`,
    actorUserId: user.id,
  });

  return jsonOk({ ok: true, status: "adjourned", nextHearingUnitId: newHearingUnitId });
});
