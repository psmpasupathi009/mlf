import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit, pickAuditFields } from "@/lib/audit";
import { canAccessAppointment } from "@/lib/appointments/access";
import { canShowConfirmButton } from "@/lib/appointments/confirm-window";
import { enrichAppointment } from "@/features/appointments/server/enrich";
import { isClientOnlyUser } from "@/lib/auth/client-portal";
import {
  findUsersByMobiles,
  notifyUsers,
  scheduleNotify,
} from "@/lib/notifications/notify";
import { formatIstTime, istDisplayDate } from "@/lib/utils/ist";

const CONFIRM_AUDIT_KEYS = [
  "confirmedAt",
  "confirmedByUnitId",
  "confirmedByRole",
  "status",
] as const;

export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "appointments", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.appointment.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Appointment not found", 404);

  if (!canAccessAppointment(user, item)) {
    return jsonFail("NOT_FOUND", "Appointment not found", 404);
  }

  if (
    !canShowConfirmButton({
      status: item.status,
      confirmedAt: item.confirmedAt,
      scheduledAt: item.scheduledAt,
      durationMin: item.durationMin,
    })
  ) {
    if (item.confirmedAt) {
      return jsonFail(
        "VALIDATION",
        "This appointment is already confirmed",
        400
      );
    }
    if (item.status !== "scheduled") {
      return jsonFail(
        "VALIDATION",
        "Only scheduled appointments can be confirmed",
        400
      );
    }
    return jsonFail(
      "VALIDATION",
      "Confirm coming is only available in the confirmation window before the appointment",
      400
    );
  }

  const clientActor = isClientOnlyUser(user.roles);
  const confirmedByRole = clientActor ? "client" : "staff";
  const now = new Date();

  const updated = await prisma.appointment.update({
    where: { id: item.id },
    data: {
      confirmedAt: now,
      confirmedByUnitId: user.unitId,
      confirmedByRole,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "appointment.confirm",
    entity: "Appointment",
    entityUnitId: updated.unitId,
    meta: {
      after: pickAuditFields(
        updated as Record<string, unknown>,
        CONFIRM_AUDIT_KEYS
      ),
    },
  });

  scheduleNotify(async () => {
    const when = `${istDisplayDate(updated.scheduledAt)} ${formatIstTime(updated.scheduledAt)}`;
    const body = `${updated.title} · ${when}`;
    const recipients: Array<{
      userId: string;
      userUnitId: string;
      type: string;
      title: string;
      body: string;
      href: string;
      meta: Record<string, string>;
    }> = [];

    if (clientActor && updated.advocateMobile) {
      const advocates = await findUsersByMobiles([updated.advocateMobile]);
      for (const a of advocates) {
        if (a.id === user.id) continue;
        recipients.push({
          userId: a.id,
          userUnitId: a.unitId,
          type: "appointment",
          title: "Client confirmed appointment",
          body,
          href: "/appointments",
          meta: { appointmentUnitId: updated.unitId },
        });
      }
    }

    if (!clientActor && updated.clientUnitId) {
      const portalUser = await prisma.user.findFirst({
        where: {
          isActive: true,
          roles: { has: "client" },
          OR: [
            { clientUnitId: updated.clientUnitId },
            { unitId: updated.clientUnitId },
          ],
        },
        select: { id: true, unitId: true },
      });
      if (portalUser && portalUser.id !== user.id) {
        recipients.push({
          userId: portalUser.id,
          userUnitId: portalUser.unitId,
          type: "appointment",
          title: "Office confirmed your appointment",
          body,
          href: "/appointments",
          meta: { appointmentUnitId: updated.unitId },
        });
      }
    }

    if (recipients.length) await notifyUsers(recipients);
  });

  return jsonOk({
    appointment: await enrichAppointment(updated, {
      stripNotes: clientActor,
    }),
  });
});
