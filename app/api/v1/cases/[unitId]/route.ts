import type { Prisma } from "@prisma/client";
import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { updateCaseSchema } from "@/lib/validations/cases.schema";
import { toCaseSummary, toHearingSummary } from "@/features/cases/server/serialize";
import { toClientSummary } from "@/features/clients/server/serialize";
import { toDocumentSummary } from "@/features/documents/server/serialize";
import {
  canTransitionStatus,
  normalizeCaseStatus,
  PRE_NUMBER_STATUSES,
  type FilingChecklistState,
} from "@/config/company/case-pipeline";
import {
  findCaseNotifyRecipients,
  notifyUsers,
  scheduleNotify,
} from "@/lib/notifications/notify";

function parseChecklist(raw: Prisma.JsonValue | null | undefined): FilingChecklistState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as FilingChecklistState;
}

export const GET = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "cases", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId ? await prisma.case.findUnique({ where: { unitId } }) : null;
  if (!item) return jsonFail("NOT_FOUND", "Case not found", 404);

  const [client, hearings, documents] = await Promise.all([
    prisma.client.findUnique({ where: { id: item.clientId } }),
    prisma.hearing.findMany({
      where: { caseId: item.id },
      orderBy: { hearingDate: "desc" },
      take: 100,
    }),
    prisma.document.findMany({
      where: { caseId: item.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return jsonOk({
    case: toCaseSummary(item),
    client: client ? toClientSummary(client) : null,
    hearings: hearings.map(toHearingSummary),
    documents: documents.map(toDocumentSummary),
  });
});

export const PATCH = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "cases", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId ? await prisma.case.findUnique({ where: { unitId } }) : null;
  if (!item) return jsonFail("NOT_FOUND", "Case not found", 404);

  const raw = await request.json();
  const parsed = updateCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  if (input.caseNumber) {
    const dupe = await prisma.case.findFirst({
      where: { caseNumber: input.caseNumber, id: { not: item.id } },
    });
    if (dupe) return jsonFail("CONFLICT", "A case with this case number already exists", 409);
  }

  const caseNumberNewlySet = Boolean(input.caseNumber) && !item.caseNumber;
  const cnrNewlySet = Boolean(input.cnr) && !item.cnr;
  const isPreNumber = PRE_NUMBER_STATUSES.includes(normalizeCaseStatus(item.status));

  let nextStatus = input.status;
  let nextChecklist: FilingChecklistState | undefined = input.filingChecklist
    ? {
        ...parseChecklist(item.filingChecklist),
        ...(input.filingChecklist as FilingChecklistState),
      }
    : undefined;

  if (nextStatus && nextStatus !== item.status) {
    if (!canTransitionStatus(item.status, nextStatus)) {
      return jsonFail(
        "VALIDATION",
        `Cannot move case from “${normalizeCaseStatus(item.status)}” to “${normalizeCaseStatus(nextStatus)}”. Use the pipeline steps on the case page.`,
        400
      );
    }
  }

  if (
    !nextStatus &&
    (caseNumberNewlySet || cnrNewlySet) &&
    isPreNumber
  ) {
    nextStatus = "active";
    nextChecklist = {
      ...(nextChecklist ?? parseChecklist(item.filingChecklist)),
      numbered: true,
    };
  }

  const updated = await prisma.case.update({
    where: { id: item.id },
    data: {
      caseNumber: input.caseNumber === "" ? null : input.caseNumber,
      filingNumber: input.filingNumber === "" ? null : input.filingNumber,
      caseYear: input.caseYear === undefined ? undefined : input.caseYear,
      cnr: input.cnr === "" ? null : input.cnr,
      state: input.state === "" ? null : input.state,
      district: input.district === "" ? null : input.district,
      city: input.city === "" ? null : input.city,
      courtName: input.courtName === "" ? null : input.courtName,
      advocateMobiles: input.advocateMobiles,
      primaryAdvocateMobile: input.primaryAdvocateMobile === "" ? null : input.primaryAdvocateMobile,
      opposingParty: input.opposingParty === "" ? null : input.opposingParty,
      ourSide: input.ourSide === "" ? null : input.ourSide,
      underActs: input.underActs === "" ? null : input.underActs,
      policeStation: input.policeStation === "" ? null : input.policeStation,
      firNumber: input.firNumber === "" ? null : input.firNumber,
      stage: input.stage === "" ? null : input.stage,
      caseType: input.caseType === "" ? null : input.caseType,
      status: nextStatus,
      filingDate: input.filingDate,
      nextHearingAt: input.nextHearingAt,
      agreedFee: input.agreedFee,
      notes: input.notes === "" ? null : input.notes,
      ...(input.battaDue !== undefined ? { battaDue: input.battaDue } : {}),
      ...(input.awaitingService !== undefined
        ? { awaitingService: input.awaitingService }
        : {}),
      ...(nextChecklist
        ? { filingChecklist: nextChecklist as Prisma.InputJsonValue }
        : {}),
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "case.update",
    entity: "Case",
    entityUnitId: updated.unitId,
  });

  if (input.battaDue === true && !item.battaDue) {
    scheduleNotify(async () => {
      const recipients = await findCaseNotifyRecipients([
        ...updated.advocateMobiles,
        updated.primaryAdvocateMobile,
      ]);
      const label =
        updated.caseNumber || updated.filingNumber || updated.unitId;
      await notifyUsers(
        recipients
          .filter((u) => u.id !== user.id)
          .map((u) => ({
            userId: u.id,
            userUnitId: u.unitId,
            type: "batta_due",
            title: `Batta due: ${label}`,
            href: `/cases/${updated.unitId}`,
            meta: { caseUnitId: updated.unitId },
          }))
      );
    });
  }

  return jsonOk({ case: toCaseSummary(updated) });
});
