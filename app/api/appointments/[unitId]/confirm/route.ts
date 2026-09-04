import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit, pickAuditFields } from "@/lib/audit";
import { canAccessAppointment } from "@/lib/appointments/access";
import {
  appointmentWhenBody,
  canShowConfirmButton,
} from "@/lib/appointments/confirm-window";
import { findPortalClientUser } from "@/lib/appointments/portal-client";
import { enrichAppointment } from "@/features/appointments/server/enrich";
import { isClientOnlyUser } from "@/lib/auth/client-portal";
import {
  findUsersByMobiles,
  notifyUsers,
  scheduleNotify,
  type NotifyInput,
} from "@/lib/notifications/notify";

const CONFIRM_AUDIT_KEYS = [
  "confirmedAt",
  "confirmedByUnitId",
  "confirmedByRole",
  "status",
] as const;

function confirmDeniedMessage(item: {
  status: string;
  confirmedAt: Date | null;
}): string {
  if (item.confirmedAt) return "This appointment is already confirmed";
  if (item.status !== "scheduled") {
    return "Only scheduled appointments can be confirmed";
  }
  return "Confirm coming is only available in the confirmation window before the appointment";
}

export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "appointments", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.appointment.findUnique({ where: { unitId } })
    : null;
  if (!item || !canAccessAppointment(user, item)) {
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
    return jsonFail("VALIDATION", confirmDeniedMessage(item), 400);
  }

  const clientActor = isClientOnlyUser(user.roles);
  const updated = await prisma.appointment.update({
    where: { id: item.id },
    data: {
      confirmedAt: new Date(),
      confirmedByUnitId: user.unitId,
      confirmedByRole: clientActor ? "client" : "staff",
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
    const body = appointmentWhenBody(updated.title, updated.scheduledAt);
    const meta = { appointmentUnitId: updated.unitId };
    const recipients: NotifyInput[] = [];

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
          meta,
        });
      }
    } else if (!clientActor && updated.clientUnitId) {
      const portal = await findPortalClientUser(updated.clientUnitId);
      if (portal && portal.id !== user.id) {
        recipients.push({
          userId: portal.id,
          userUnitId: portal.unitId,
          type: "appointment",
          title: "Office confirmed your appointment",
          body,
          href: "/appointments",
          meta,
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
