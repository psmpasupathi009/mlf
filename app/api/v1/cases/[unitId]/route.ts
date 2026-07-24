import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { updateCaseSchema } from "@/lib/validations/cases.schema";
import { toCaseSummary, toHearingSummary } from "@/features/cases/server/serialize";
import { toClientSummary } from "@/features/clients/server/serialize";
import { toDocumentSummary } from "@/features/documents/server/serialize";

export const GET = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "cases", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId ? await prisma.case.findUnique({ where: { unitId } }) : null;
  if (!item) return jsonFail("NOT_FOUND", "Case not found", 404);

  const [client, hearings, documents] = await Promise.all([
    prisma.client.findUnique({ where: { id: item.clientId } }),
    prisma.hearing.findMany({ where: { caseId: item.id }, orderBy: { hearingDate: "desc" } }),
    prisma.document.findMany({
      where: { caseId: item.id },
      orderBy: { createdAt: "desc" },
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
      status: input.status,
      filingDate: input.filingDate,
      nextHearingAt: input.nextHearingAt,
      agreedFee: input.agreedFee,
      notes: input.notes === "" ? null : input.notes,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "case.update",
    entity: "Case",
    entityUnitId: updated.unitId,
  });

  return jsonOk({ case: toCaseSummary(updated) });
});
