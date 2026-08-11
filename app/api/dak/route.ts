import type { Prisma } from "@prisma/client";
import { apiHandler, jsonFail, jsonOk, jsonOkList, parsePagination } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit, pickAuditFields } from "@/lib/audit";
import { createDakSchema } from "@/lib/validations/dak.schema";
import { toDakSummary } from "@/features/dak/server/serialize";
import { containsInsensitive } from "@/lib/db/search";
import { istDayBounds } from "@/lib/utils/ist";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "dak", "view");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const q = searchParams.get("q")?.trim() ?? "";
  const direction = searchParams.get("direction")?.trim();
  const dateKey = searchParams.get("date")?.trim();

  const where: Prisma.DakEntryWhereInput = {
    ...(direction === "in" || direction === "out" ? { direction } : {}),
    ...(dateKey
      ? (() => {
          const { start, end } = istDayBounds(dateKey);
          return { entryDate: { gte: start, lte: end } };
        })()
      : {}),
    ...(q
      ? {
          OR: [
            { subject: containsInsensitive(q) },
            { fromTo: containsInsensitive(q) },
            { trackingNo: containsInsensitive(q) },
            { unitId: containsInsensitive(q) },
            { caseUnitId: containsInsensitive(q) },
            { clientUnitId: containsInsensitive(q) },
            { notes: containsInsensitive(q) },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.dakEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.dakEntry.count({ where }),
  ]);

  const caseUnitIds = [
    ...new Set(rows.map((r) => r.caseUnitId).filter(Boolean) as string[]),
  ];
  const clientUnitIds = [
    ...new Set(rows.map((r) => r.clientUnitId).filter(Boolean) as string[]),
  ];
  const [cases, clients] = await Promise.all([
    caseUnitIds.length
      ? prisma.case.findMany({
          where: { unitId: { in: caseUnitIds } },
          select: { unitId: true, caseNumber: true },
        })
      : Promise.resolve([]),
    clientUnitIds.length
      ? prisma.client.findMany({
          where: { unitId: { in: clientUnitIds } },
          select: { unitId: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const caseMap = new Map(cases.map((c) => [c.unitId, c.caseNumber]));
  const clientMap = new Map(clients.map((c) => [c.unitId, c.name]));

  return jsonOkList(
    rows.map((r) =>
      toDakSummary(r, {
        caseNumber: r.caseUnitId ? caseMap.get(r.caseUnitId) ?? null : null,
        clientName: r.clientUnitId
          ? clientMap.get(r.clientUnitId) ?? null
          : null,
      })
    ),
    { page, pageSize, total }
  );
});

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "dak", "create");
  if (!user) return response;

  const raw = await request.json();
  const parsed = createDakSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const input = parsed.data;

  let caseUnitId: string | undefined;
  if (input.caseUnitId) {
    const caseItem = await prisma.case.findUnique({
      where: { unitId: input.caseUnitId },
      select: { unitId: true, caseNumber: true },
    });
    if (!caseItem) return jsonFail("VALIDATION", "Case not found", 400);
    caseUnitId = caseItem.unitId;
  }

  let clientUnitId: string | undefined;
  if (input.clientUnitId) {
    const client = await prisma.client.findUnique({
      where: { unitId: input.clientUnitId },
      select: { unitId: true },
    });
    if (!client) return jsonFail("VALIDATION", "Client not found", 400);
    clientUnitId = client.unitId;
  }

  const unitId = await nextUnitId("dak");
  const created = await prisma.dakEntry.create({
    data: {
      unitId,
      direction: input.direction,
      entryDate: input.entryDate,
      subject: input.subject,
      fromTo: input.fromTo || undefined,
      mode: input.mode || undefined,
      trackingNo: input.trackingNo || undefined,
      caseUnitId,
      clientUnitId,
      notes: input.notes || undefined,
      createdById: user.id,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "dak.create",
    entity: "DakEntry",
    entityUnitId: created.unitId,
    meta: {
      after: pickAuditFields(created as Record<string, unknown>, [
        "direction",
        "entryDate",
        "subject",
        "fromTo",
        "mode",
        "trackingNo",
        "caseUnitId",
        "clientUnitId",
        "notes",
      ] as const),
    },
  });

  return jsonOk({ dak: toDakSummary(created) }, 201);
});
