import type { Prisma } from "@prisma/client";
import { apiHandler, jsonFail, jsonOk, jsonOkList, parsePagination } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit, pickAuditFields } from "@/lib/audit";
import { createCaseSchema } from "@/lib/validations/cases.schema";
import { toCaseSummary } from "@/features/cases/server/serialize";
import type { Case } from "@prisma/client";
import {
  buildCaseListWhere,
  parseCaseListFilters,
} from "@/features/cases/server/filters";

const CASE_AUDIT_KEYS = [
  "clientUnitId",
  "caseNumber",
  "filingNumber",
  "caseYear",
  "cnr",
  "state",
  "district",
  "city",
  "courtName",
  "advocateMobiles",
  "primaryAdvocateMobile",
  "opposingParty",
  "ourSide",
  "underActs",
  "policeStation",
  "firNumber",
  "stage",
  "caseType",
  "status",
  "filingDate",
  "nextHearingAt",
  "agreedFee",
  "notes",
  "battaDue",
  "awaitingService",
  "filingChecklist",
] as const;

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "view");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const where = buildCaseListWhere(parseCaseListFilters(searchParams));

  const [rows, total] = await Promise.all([
    prisma.case.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        unitId: true,
        clientId: true,
        clientUnitId: true,
        caseNumber: true,
        filingNumber: true,
        caseYear: true,
        cnr: true,
        state: true,
        district: true,
        city: true,
        courtName: true,
        advocateMobiles: true,
        primaryAdvocateMobile: true,
        opposingParty: true,
        ourSide: true,
        underActs: true,
        policeStation: true,
        firNumber: true,
        stage: true,
        caseType: true,
        status: true,
        filingDate: true,
        nextHearingAt: true,
        agreedFee: true,
        notes: true,
        filingChecklist: true,
        battaDue: true,
        awaitingService: true,
        createdAt: true,
        updatedAt: true,
        createdById: true,
      },
    }),
    prisma.case.count({ where }),
  ]);

  const clientIds = Array.from(new Set(rows.map((r) => r.clientId)));
  const clients = clientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true, unitId: true },
      })
    : [];
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const data = rows.map((r) => ({
    ...toCaseSummary(r as Case),
    clientName: clientMap.get(r.clientId)?.name ?? null,
  }));

  return jsonOkList(data, { page, pageSize, total });
});

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "create");
  if (!user) return response;

  const raw = await request.json();
  const parsed = createCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  const client = await prisma.client.findUnique({ where: { unitId: input.clientUnitId } });
  if (!client) return jsonFail("VALIDATION", "Client not found", 400);

  if (input.caseNumber) {
    const dupe = await prisma.case.findFirst({ where: { caseNumber: input.caseNumber } });
    if (dupe) return jsonFail("CONFLICT", "A case with this case number already exists", 409);
  }

  const unitId = await nextUnitId("case");
  const created = await prisma.case.create({
    data: {
      unitId,
      clientId: client.id,
      clientUnitId: client.unitId,
      caseNumber: input.caseNumber || undefined,
      filingNumber: input.filingNumber || undefined,
      caseYear: input.caseYear,
      cnr: input.cnr || undefined,
      state: input.state || undefined,
      district: input.district || undefined,
      city: input.city || undefined,
      courtName: input.courtName || undefined,
      advocateMobiles: input.advocateMobiles ?? [],
      primaryAdvocateMobile: input.primaryAdvocateMobile || undefined,
      opposingParty: input.opposingParty || undefined,
      ourSide: input.ourSide || undefined,
      underActs: input.underActs || undefined,
      policeStation: input.policeStation || undefined,
      firNumber: input.firNumber || undefined,
      stage: input.stage || undefined,
      caseType: input.caseType || undefined,
      status: input.status ?? "enquiry",
      filingDate: input.filingDate,
      nextHearingAt: input.nextHearingAt,
      agreedFee: input.agreedFee,
      notes: input.notes || undefined,
      battaDue: input.battaDue,
      awaitingService: input.awaitingService,
      filingChecklist: input.filingChecklist as Prisma.InputJsonValue | undefined,
      createdById: user.id,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "case.create",
    entity: "Case",
    entityUnitId: created.unitId,
    meta: {
      after: pickAuditFields(created as Record<string, unknown>, CASE_AUDIT_KEYS),
    },
  });

  return jsonOk({ case: toCaseSummary(created) }, 201);
});
