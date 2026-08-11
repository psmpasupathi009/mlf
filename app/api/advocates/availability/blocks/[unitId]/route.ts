import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { canBookForAnyAdvocate } from "@/lib/appointments/booking-rules";
import { updateTimeBlockSchema } from "@/lib/validations/availability.schema";

function toBlock(b: {
  unitId: string;
  userUnitId: string;
  startsAt: Date;
  endsAt: Date;
  kind: string;
  reason: string | null;
}) {
  return {
    unitId: b.unitId,
    userUnitId: b.userUnitId,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    kind: b.kind,
    reason: b.reason,
  };
}

export const PATCH = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "appointments", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const block = unitId
    ? await prisma.advocateTimeBlock.findUnique({ where: { unitId } })
    : null;
  if (!block) return jsonFail("NOT_FOUND", "Block not found", 404);

  if (block.userId !== user.id && !canBookForAnyAdvocate(user.roles)) {
    return jsonFail("FORBIDDEN", "You can only edit your own blocks", 403);
  }

  const raw = await request.json();
  const parsed = updateTimeBlockSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const input = parsed.data;

  const nextStarts = input.startsAt ?? block.startsAt;
  const nextEnds = input.endsAt ?? block.endsAt;
  if (nextEnds.getTime() <= nextStarts.getTime()) {
    return jsonFail("VALIDATION", "End must be after start", 400);
  }

  const updated = await prisma.advocateTimeBlock.update({
    where: { id: block.id },
    data: {
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.reason !== undefined
        ? { reason: input.reason || null }
        : {}),
    },
  });

  const kind = updated.kind;
  if (["court", "personal", "other"].includes(kind)) {
    const { istDateKey } = await import("@/lib/utils/ist");
    const {
      dismissOpenCoverageForBlock,
      enqueueCoverageForAdvocateRange,
    } = await import("@/lib/hearings/coverage");
    // Drop open items tied to the old range, then enqueue for the new window
    await dismissOpenCoverageForBlock(updated.id);
    const owner = await prisma.user.findUnique({
      where: { id: updated.userId },
      select: { mobile: true },
    });
    if (owner?.mobile) {
      await enqueueCoverageForAdvocateRange({
        advocateMobile: owner.mobile,
        fromDate: istDateKey(updated.startsAt),
        toDate: istDateKey(updated.endsAt),
        reason: "unavailable_block",
        sourceBlockId: updated.id,
        createdById: user.id,
      });
    }
  } else if (["court", "personal", "other"].includes(block.kind)) {
    const { dismissOpenCoverageForBlock } = await import(
      "@/lib/hearings/coverage"
    );
    await dismissOpenCoverageForBlock(updated.id);
  }

  return jsonOk({ block: toBlock(updated) });
});

export const DELETE = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "appointments", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const block = unitId
    ? await prisma.advocateTimeBlock.findUnique({ where: { unitId } })
    : null;
  if (!block) return jsonFail("NOT_FOUND", "Block not found", 404);

  if (block.userId !== user.id && !canBookForAnyAdvocate(user.roles)) {
    return jsonFail("FORBIDDEN", "You can only delete your own blocks", 403);
  }

  await prisma.advocateTimeBlock.delete({ where: { id: block.id } });

  if (["court", "personal", "other"].includes(block.kind)) {
    const { dismissOpenCoverageForBlock } = await import(
      "@/lib/hearings/coverage"
    );
    await dismissOpenCoverageForBlock(block.id);
  }

  return jsonOk({ deleted: true });
});
