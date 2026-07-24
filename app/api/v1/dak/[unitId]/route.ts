import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { updateDakSchema } from "@/lib/validations/dak.schema";
import { toDakSummary } from "@/features/dak/server/serialize";

export const PATCH = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "dak", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.dakEntry.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Dak entry not found", 404);

  const raw = await request.json();
  const parsed = updateDakSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const input = parsed.data;

  let nextCaseUnitId =
    input.caseUnitId === undefined
      ? undefined
      : input.caseUnitId === ""
        ? null
        : input.caseUnitId;

  if (typeof nextCaseUnitId === "string") {
    const caseItem = await prisma.case.findUnique({
      where: { unitId: nextCaseUnitId },
      select: { unitId: true },
    });
    if (!caseItem) return jsonFail("VALIDATION", "Case not found", 400);
    nextCaseUnitId = caseItem.unitId;
  }

  const before = {
    direction: item.direction,
    subject: item.subject,
    entryDate: item.entryDate.toISOString(),
  };

  const updated = await prisma.dakEntry.update({
    where: { id: item.id },
    data: {
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
      ...(input.entryDate !== undefined ? { entryDate: input.entryDate } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.fromTo !== undefined
        ? { fromTo: input.fromTo === "" ? null : input.fromTo }
        : {}),
      ...(input.mode !== undefined
        ? { mode: input.mode === "" ? null : input.mode }
        : {}),
      ...(input.trackingNo !== undefined
        ? { trackingNo: input.trackingNo === "" ? null : input.trackingNo }
        : {}),
      ...(nextCaseUnitId !== undefined ? { caseUnitId: nextCaseUnitId } : {}),
      ...(input.notes !== undefined
        ? { notes: input.notes === "" ? null : input.notes }
        : {}),
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "dak.update",
    entity: "DakEntry",
    entityUnitId: updated.unitId,
    meta: {
      before,
      after: {
        direction: updated.direction,
        subject: updated.subject,
        entryDate: updated.entryDate.toISOString(),
      },
    },
  });

  let caseNumber: string | null = null;
  if (updated.caseUnitId) {
    const cse = await prisma.case.findUnique({
      where: { unitId: updated.caseUnitId },
      select: { caseNumber: true },
    });
    caseNumber = cse?.caseNumber ?? null;
  }

  return jsonOk({ dak: toDakSummary(updated, { caseNumber }) });
});

export const DELETE = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "dak", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.dakEntry.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Dak entry not found", 404);

  await prisma.dakEntry.delete({ where: { id: item.id } });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "dak.delete",
    entity: "DakEntry",
    entityUnitId: item.unitId,
    meta: { subject: item.subject, direction: item.direction },
  });

  return jsonOk({ deleted: true });
});
