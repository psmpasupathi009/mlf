import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { addHearingSchema } from "@/lib/validations/cases.schema";
import { toHearingSummary } from "@/features/cases/server/serialize";

export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "cases", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId ? await prisma.case.findUnique({ where: { unitId } }) : null;
  if (!item) return jsonFail("NOT_FOUND", "Case not found", 404);

  const raw = await request.json();
  const parsed = addHearingSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  const hearingUnitId = await nextUnitId("hearing");
  const [hearing] = await prisma.$transaction([
    prisma.hearing.create({
      data: {
        unitId: hearingUnitId,
        caseId: item.id,
        caseUnitId: item.unitId,
        hearingDate: input.hearingDate,
        purpose: input.purpose || undefined,
        notes: input.notes || undefined,
        createdById: user.id,
      },
    }),
    prisma.case.update({
      where: { id: item.id },
      data: {
        nextHearingAt: input.hearingDate,
        status: item.status === "pending" ? "listed" : undefined,
      },
    }),
  ]);

  await writeAudit({
    actorUnitId: user.unitId,
    action: "hearing.create",
    entity: "Hearing",
    entityUnitId: hearing.unitId,
    meta: { caseUnitId: item.unitId },
  });

  return jsonOk({ hearing: toHearingSummary(hearing) }, 201);
});
