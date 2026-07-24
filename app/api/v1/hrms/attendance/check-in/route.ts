import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { istDateKey } from "@/lib/utils/ist";
import { checkInOutSchema } from "@/lib/validations/hrms.schema";
import { toAttendanceSummary } from "@/features/hrms/server/serialize";

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "hrms", "own_attendance");
  if (!user) return response;

  const raw = await request.json().catch(() => ({}));
  const parsed = checkInOutSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }

  const today = istDateKey();

  const onLeave = await prisma.leaveRequest.findFirst({
    where: {
      userId: user.id,
      status: "approved",
      fromDate: { lte: today },
      toDate: { gte: today },
    },
    select: { unitId: true },
  });
  if (onLeave) {
    return jsonFail(
      "CONFLICT",
      "You are on approved leave today — check-in is not needed",
      409
    );
  }

  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId: user.id, date: today } } });

  if (existing?.checkInAt) {
    return jsonFail("CONFLICT", "Already checked in today", 409);
  }

  let record;
  try {
    record = existing
      ? await prisma.attendance.update({
          where: { id: existing.id },
          data: { checkInAt: new Date(), notes: parsed.data.notes || existing.notes },
        })
      : await prisma.attendance.create({
          data: {
            unitId: await nextUnitId("attendance"),
            userId: user.id,
            userUnitId: user.unitId,
            date: today,
            checkInAt: new Date(),
            notes: parsed.data.notes || undefined,
          },
        });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "P2002") {
      return jsonFail("CONFLICT", "Already checked in today", 409);
    }
    throw err;
  }

  await writeAudit({
    actorUnitId: user.unitId,
    action: "attendance.check_in",
    entity: "Attendance",
    entityUnitId: record.unitId,
  });

  return jsonOk({ attendance: toAttendanceSummary(record) });
});
