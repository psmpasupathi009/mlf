import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import {
  canBookForAnyAdvocate,
  resolveBookingAdvocateMobile,
} from "@/lib/appointments/booking-rules";
import { assertSlotBookable } from "@/lib/appointments/availability";
import { updateAppointmentSchema } from "@/lib/validations/appointments.schema";
import { enrichAppointment } from "@/features/appointments/server/enrich";

export const GET = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "appointments", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.appointment.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Appointment not found", 404);

  if (!canBookForAnyAdvocate(user.roles)) {
    const ten = user.mobile.replace(/\D/g, "").slice(-10);
    const aptTen = (item.advocateMobile ?? "").replace(/\D/g, "").slice(-10);
    if (aptTen && aptTen !== ten) {
      return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
    }
  }

  return jsonOk({ appointment: await enrichAppointment(item) });
});

export const PATCH = apiHandler(async (request, context) => {
  const raw = await request.json();
  const parsed = updateAppointmentSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const input = parsed.data;

  const action = input.status === "cancelled" ? "cancel" : "edit";
  const { user, response } = await requirePerm(request, "appointments", action);
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.appointment.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Appointment not found", 404);

  if (!canBookForAnyAdvocate(user.roles)) {
    const ten = user.mobile.replace(/\D/g, "").slice(-10);
    const aptTen = (item.advocateMobile ?? "").replace(/\D/g, "").slice(-10);
    if (aptTen && aptTen !== ten) {
      return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
    }
  }

  if (input.clientUnitId) {
    const client = await prisma.client.findUnique({
      where: { unitId: input.clientUnitId },
    });
    if (!client) return jsonFail("VALIDATION", "Client not found", 400);
  }

  let caseId: string | null | undefined = undefined;
  let caseUnitId: string | null | undefined = undefined;
  if (input.caseUnitId !== undefined) {
    if (input.caseUnitId === "") {
      caseId = null;
      caseUnitId = null;
    } else {
      const caseItem = await prisma.case.findUnique({
        where: { unitId: input.caseUnitId },
        select: { id: true, unitId: true },
      });
      if (!caseItem) return jsonFail("VALIDATION", "Case not found", 400);
      caseId = caseItem.id;
      caseUnitId = caseItem.unitId;
    }
  }

  let advocateMobile: string | null | undefined = undefined;
  if (input.advocateMobile !== undefined) {
    if (input.advocateMobile === "") {
      advocateMobile = null;
    } else {
      const resolved = resolveBookingAdvocateMobile({
        roles: user.roles,
        actorMobile: user.mobile,
        requestedMobile: input.advocateMobile,
      });
      if (!resolved.mobile) {
        return jsonFail(
          "VALIDATION",
          resolved.error ?? "Select an advocate",
          400
        );
      }
      advocateMobile = resolved.mobile;
    }
  } else if (!canBookForAnyAdvocate(user.roles)) {
    advocateMobile = resolveBookingAdvocateMobile({
      roles: user.roles,
      actorMobile: user.mobile,
    }).mobile;
  }

  const nextStatus = input.status ?? item.status;
  const nextStart = input.scheduledAt ?? item.scheduledAt;
  const nextDuration = input.durationMin ?? item.durationMin;
  const nextAdvocate =
    advocateMobile !== undefined ? advocateMobile : item.advocateMobile;
  const nextClient =
    input.clientUnitId !== undefined
      ? input.clientUnitId || null
      : item.clientUnitId;

  if (
    nextStatus === "scheduled" &&
    nextAdvocate &&
    (input.scheduledAt !== undefined ||
      input.durationMin !== undefined ||
      input.advocateMobile !== undefined ||
      input.clientUnitId !== undefined ||
      input.status === "scheduled")
  ) {
    const bookable = await assertSlotBookable({
      advocateMobile: nextAdvocate,
      clientUnitId: nextClient,
      start: nextStart,
      durationMin: nextDuration,
      excludeAppointmentUnitId: item.unitId,
    });
    if (!bookable.ok) {
      return jsonFail(bookable.code, bookable.message, 409);
    }
  }

  const updated = await prisma.appointment.update({
    where: { id: item.id },
    data: {
      clientUnitId: input.clientUnitId === "" ? null : input.clientUnitId,
      ...(input.caseUnitId !== undefined ? { caseId, caseUnitId } : {}),
      advocateMobile,
      title: input.title,
      scheduledAt: input.scheduledAt,
      durationMin: input.durationMin,
      mode: input.mode,
      location: input.location === "" ? null : input.location,
      notes: input.notes === "" ? null : input.notes,
      status: input.status,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action:
      input.status === "cancelled"
        ? "appointment.cancel"
        : "appointment.update",
    entity: "Appointment",
    entityUnitId: updated.unitId,
  });

  return jsonOk({ appointment: await enrichAppointment(updated) });
});
