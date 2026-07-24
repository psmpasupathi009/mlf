import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { adjournHearingSchema } from "@/lib/validations/cases.schema";
import { toHearingSummary } from "@/features/cases/server/serialize";
import {
  findCaseNotifyRecipients,
  isHearingWithinNextIstDays,
  notifyUsers,
  scheduleNotify,
} from "@/lib/notifications/notify";
import { istDisplayDate } from "@/lib/utils/ist";

export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "cases", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const hearing = unitId ? await prisma.hearing.findUnique({ where: { unitId } }) : null;
  if (!hearing) return jsonFail("NOT_FOUND", "Hearing not found", 404);
  if (hearing.isAdjourned) {
    return jsonFail("CONFLICT", "This hearing is already adjourned", 409);
  }

  const raw = await request.json();
  const parsed = adjournHearingSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  const nextHearingUnitId = await nextUnitId("hearing");
  const caseItem = await prisma.case.findUnique({ where: { id: hearing.caseId } });

  const [, nextHearing] = await prisma.$transaction([
    prisma.hearing.update({
      where: { id: hearing.id },
      data: {
        isAdjourned: true,
        outcome: input.outcome || "Adjourned",
        notes: input.notes || undefined,
      },
    }),
    prisma.hearing.create({
      data: {
        unitId: nextHearingUnitId,
        caseId: hearing.caseId,
        caseUnitId: hearing.caseUnitId,
        hearingDate: input.nextHearingDate,
        purpose: "Adjourned hearing",
        createdById: user.id,
      },
    }),
    prisma.case.update({
      where: { id: hearing.caseId },
      data: {
        nextHearingAt: input.nextHearingDate,
        // Leave pipeline status unchanged; only normalize legacy pending/listed when numbered.
        ...(caseItem &&
        (caseItem.status === "pending" || caseItem.status === "listed") &&
        (caseItem.caseNumber || caseItem.cnr)
          ? { status: "active" as const }
          : {}),
      },
    }),
  ]);

  await writeAudit({
    actorUnitId: user.unitId,
    action: "hearing.adjourn",
    entity: "Hearing",
    entityUnitId: hearing.unitId,
    meta: { nextHearingUnitId: nextHearing.unitId },
  });

  if (caseItem && isHearingWithinNextIstDays(nextHearing.hearingDate, 2)) {
    scheduleNotify(async () => {
      const recipients = await findCaseNotifyRecipients([
        ...caseItem.advocateMobiles,
        caseItem.primaryAdvocateMobile,
      ]);
      const label =
        caseItem.caseNumber || caseItem.filingNumber || caseItem.unitId;
      await notifyUsers(
        recipients
          .filter((u) => u.id !== user.id)
          .map((u) => ({
            userId: u.id,
            userUnitId: u.unitId,
            type: "hearing_tomorrow",
            title: `Hearing soon: ${label}`,
            body: istDisplayDate(nextHearing.hearingDate),
            href: `/cases/${caseItem.unitId}`,
            meta: {
              hearingUnitId: nextHearing.unitId,
              caseUnitId: caseItem.unitId,
            },
          }))
      );
    });
  }

  return jsonOk({ hearing: toHearingSummary(nextHearing) });
});
