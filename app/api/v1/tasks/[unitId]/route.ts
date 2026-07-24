import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { updateOfficeTaskSchema } from "@/lib/validations/tasks.schema";
import { toOfficeTaskSummary } from "@/features/tasks/server/serialize";
import { notifyUser, scheduleNotify } from "@/lib/notifications/notify";

async function resolveAssignee(assigneeUnitId: string | null) {
  if (!assigneeUnitId) {
    return { assigneeUnitId: null as string | null, assigneeId: null as string | null };
  }
  const person = await prisma.user.findUnique({
    where: { unitId: assigneeUnitId },
    select: { id: true, unitId: true, name: true },
  });
  if (!person) return null;
  return {
    assigneeUnitId: person.unitId,
    assigneeId: person.id,
    name: person.name,
  };
}

export const PATCH = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "tasks", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.officeTask.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Task not found", 404);

  const raw = await request.json();
  const parsed = updateOfficeTaskSchema.safeParse(raw);
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

  let assigneeUpdate:
    | { assigneeUnitId: string | null; assigneeId: string | null }
    | undefined;
  if (input.assigneeUnitId !== undefined) {
    const resolved = await resolveAssignee(
      input.assigneeUnitId === "" ? null : input.assigneeUnitId
    );
    if (input.assigneeUnitId && !resolved) {
      return jsonFail("VALIDATION", "Assignee not found", 400);
    }
    assigneeUpdate = {
      assigneeUnitId: resolved?.assigneeUnitId ?? null,
      assigneeId: resolved?.assigneeId ?? null,
    };
  }

  const nextStatus = input.status ?? item.status;
  let completedAt = item.completedAt;
  if (nextStatus === "done" && item.status !== "done") {
    completedAt = new Date();
  } else if (nextStatus !== "done") {
    completedAt = null;
  }

  const before = {
    title: item.title,
    status: item.status,
    assigneeUnitId: item.assigneeUnitId,
  };

  const updated = await prisma.officeTask.update({
    where: { id: item.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.workDate !== undefined ? { workDate: input.workDate } : {}),
      ...(assigneeUpdate ?? {}),
      ...(nextCaseUnitId !== undefined ? { caseUnitId: nextCaseUnitId } : {}),
      ...(input.notes !== undefined
        ? { notes: input.notes === "" ? null : input.notes }
        : {}),
      ...(input.finishNote !== undefined
        ? { finishNote: input.finishNote === "" ? null : input.finishNote }
        : {}),
      completedAt,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "task.update",
    entity: "OfficeTask",
    entityUnitId: updated.unitId,
    meta: {
      before,
      after: {
        title: updated.title,
        status: updated.status,
        assigneeUnitId: updated.assigneeUnitId,
      },
    },
  });

  const assigneeChanged =
    assigneeUpdate &&
    assigneeUpdate.assigneeId &&
    assigneeUpdate.assigneeId !== item.assigneeId &&
    assigneeUpdate.assigneeId !== user.id;

  if (assigneeChanged) {
    scheduleNotify(async () => {
      await notifyUser({
        userId: assigneeUpdate!.assigneeId!,
        userUnitId: assigneeUpdate!.assigneeUnitId!,
        type: "task_assigned",
        title: `Task assigned: ${updated.title}`,
        body: updated.notes ?? null,
        href: "/tasks",
        meta: { taskUnitId: updated.unitId },
      });
    });
  }

  if (nextStatus === "done" && item.status !== "done" && updated.createdById) {
    scheduleNotify(async () => {
      const creator = await prisma.user.findUnique({
        where: { id: updated.createdById! },
        select: { id: true, unitId: true },
      });
      if (!creator || creator.id === user.id) return;
      await notifyUser({
        userId: creator.id,
        userUnitId: creator.unitId,
        type: "task_done",
        title: `Task done: ${updated.title}`,
        href: "/tasks",
        meta: { taskUnitId: updated.unitId },
      });
    });
  }

  let assigneeName: string | null = null;
  let caseNumber: string | null = null;
  if (updated.assigneeUnitId) {
    const person = await prisma.user.findUnique({
      where: { unitId: updated.assigneeUnitId },
      select: { name: true },
    });
    assigneeName = person?.name ?? null;
  }
  if (updated.caseUnitId) {
    const cse = await prisma.case.findUnique({
      where: { unitId: updated.caseUnitId },
      select: { caseNumber: true },
    });
    caseNumber = cse?.caseNumber ?? null;
  }

  return jsonOk({
    task: toOfficeTaskSummary(updated, { assigneeName, caseNumber }),
  });
});
