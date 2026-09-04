import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { writeAudit, pickAuditFields, diffAudit } from "@/lib/audit";
import { updateOfficeTaskSchema } from "@/lib/validations/tasks.schema";
import { toOfficeTaskSummary } from "@/features/tasks/server/serialize";
import { notifyUser, scheduleNotify } from "@/lib/notifications/notify";

const TASK_AUDIT_KEYS = [
  "title",
  "kind",
  "status",
  "dueDate",
  "workDate",
  "assigneeUnitId",
  "caseUnitId",
  "notes",
  "finishNote",
  "completedAt",
] as const;

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
  const { user, response } = await requireUser(request);
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

  const canEdit = await hasPermission(user.id, "tasks", "edit");
  const isAssignee = item.assigneeUnitId === user.unitId;
  const providedKeys = (
    Object.keys(input) as (keyof typeof input)[]
  ).filter((k) => input[k] !== undefined);
  const isSelfRespond =
    isAssignee &&
    item.status === "open" &&
    input.status === "done" &&
    typeof input.finishNote === "string" &&
    input.finishNote.trim().length > 0 &&
    providedKeys.every((k) => k === "status" || k === "finishNote");

  if (!canEdit && !isSelfRespond) {
    return jsonFail(
      "FORBIDDEN",
      "You don’t have access. Ask admin.",
      403
    );
  }

  // Assignees without edit may only mark their own open task done with a note.
  if (isSelfRespond && !canEdit) {
    const note = input.finishNote!.trim();
    const before = pickAuditFields(item as Record<string, unknown>, TASK_AUDIT_KEYS);
    const updated = await prisma.officeTask.update({
      where: { id: item.id },
      data: {
        status: "done",
        finishNote: note,
        completedAt: new Date(),
      },
    });
    const after = pickAuditFields(
      updated as Record<string, unknown>,
      TASK_AUDIT_KEYS
    );
    await writeAudit({
      actorUnitId: user.unitId,
      action: "task.update",
      entity: "OfficeTask",
      entityUnitId: updated.unitId,
      meta: {
        before,
        after,
        changes: diffAudit(before, after),
        selfRespond: true,
      },
    });

    if (updated.createdById) {
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
  }

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
  let finishNoteValue: string | null | undefined =
    input.finishNote === undefined
      ? undefined
      : input.finishNote.trim() === ""
        ? null
        : input.finishNote.trim();

  if (nextStatus === "done" && item.status !== "done") {
    if (item.status !== "open") {
      return jsonFail(
        "CONFLICT",
        "Only open tasks can be marked done",
        409
      );
    }
    const effectiveNote =
      (finishNoteValue && finishNoteValue.trim()) ||
      (item.finishNote ?? "").trim();
    if (!effectiveNote) {
      return jsonFail(
        "VALIDATION",
        "Add a finishing note before marking done",
        400
      );
    }
    finishNoteValue = effectiveNote;
    completedAt = new Date();
  } else if (nextStatus !== "done") {
    completedAt = null;
  }

  const before = pickAuditFields(item as Record<string, unknown>, TASK_AUDIT_KEYS);

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
      ...(finishNoteValue !== undefined ? { finishNote: finishNoteValue } : {}),
      completedAt,
    },
  });

  const after = pickAuditFields(
    updated as Record<string, unknown>,
    TASK_AUDIT_KEYS
  );

  await writeAudit({
    actorUnitId: user.unitId,
    action: "task.update",
    entity: "OfficeTask",
    entityUnitId: updated.unitId,
    meta: {
      before,
      after,
      changes: diffAudit(before, after),
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
