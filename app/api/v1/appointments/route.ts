import type { Prisma } from "@prisma/client";
import { apiHandler, jsonFail, jsonOk, jsonOkList, parsePagination } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import {
  canBookForAnyAdvocate,
  resolveBookingAdvocateMobile,
} from "@/lib/appointments/booking-rules";
import { assertSlotBookable } from "@/lib/appointments/availability";
import { createAppointmentSchema } from "@/lib/validations/appointments.schema";
import { enrichAppointments, enrichAppointment } from "@/features/appointments/server/enrich";
import { containsInsensitive } from "@/lib/db/search";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "appointments", "view");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const advocateMobile = searchParams.get("advocateMobile")?.trim();

  // Advocates only see their own diary unless they are admin/sub_admin/staff
  const scopeOwn = !canBookForAnyAdvocate(user.roles);
  const scopedMobile = scopeOwn
    ? user.mobile
    : advocateMobile || undefined;

  const where: Prisma.AppointmentWhereInput = {
    ...(status ? { status: status as never } : {}),
    ...(q ? { title: containsInsensitive(q) } : {}),
    ...(scopedMobile
      ? {
          OR: [
            { advocateMobile: scopedMobile },
            {
              advocateMobile: `91${scopedMobile.replace(/\D/g, "").slice(-10)}`,
            },
            {
              advocateMobile: scopedMobile.replace(/\D/g, "").slice(-10),
            },
          ],
        }
      : {}),
    ...(from || to
      ? {
          scheduledAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      skip,
      take: pageSize,
    }),
    prisma.appointment.count({ where }),
  ]);

  return jsonOkList(await enrichAppointments(rows), { page, pageSize, total });
});

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "appointments", "create");
  if (!user) return response;

  const raw = await request.json();
  const parsed = createAppointmentSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const input = parsed.data;

  if (input.clientUnitId) {
    const client = await prisma.client.findUnique({
      where: { unitId: input.clientUnitId },
    });
    if (!client) return jsonFail("VALIDATION", "Client not found", 400);
  }

  const resolved = resolveBookingAdvocateMobile({
    roles: user.roles,
    actorMobile: user.mobile,
    requestedMobile: input.advocateMobile,
  });
  if (!resolved.mobile) {
    return jsonFail("VALIDATION", resolved.error ?? "Select an advocate", 400);
  }

  // When office books for someone, advocate must exist as active advocate user
  if (canBookForAnyAdvocate(user.roles)) {
    const ten = resolved.mobile.replace(/\D/g, "").slice(-10);
    const advocate = await prisma.user.findFirst({
      where: {
        isActive: true,
        roles: { has: "advocate" },
        OR: [
          { mobile: resolved.mobile },
          { mobile: ten },
          { mobile: `91${ten}` },
        ],
      },
      select: { id: true },
    });
    if (!advocate) {
      return jsonFail(
        "VALIDATION",
        "Select an advocate from the office list",
        400
      );
    }
  }

  const bookable = await assertSlotBookable({
    advocateMobile: resolved.mobile,
    clientUnitId: input.clientUnitId || null,
    start: input.scheduledAt,
    durationMin: input.durationMin ?? 30,
  });
  if (!bookable.ok) {
    return jsonFail(bookable.code, bookable.message, 409);
  }

  const unitId = await nextUnitId("appointment");
  const created = await prisma.appointment.create({
    data: {
      unitId,
      clientUnitId: input.clientUnitId || undefined,
      advocateMobile: resolved.mobile,
      title: input.title,
      scheduledAt: input.scheduledAt,
      durationMin: input.durationMin ?? 30,
      mode: input.mode ?? "office",
      location: input.location || undefined,
      notes: input.notes || undefined,
      createdById: user.id,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "appointment.create",
    entity: "Appointment",
    entityUnitId: created.unitId,
  });

  return jsonOk({ appointment: await enrichAppointment(created) }, 201);
});
