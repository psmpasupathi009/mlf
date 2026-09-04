import type { Appointment } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  canShowConfirmButton,
  getConfirmWindowHours,
} from "@/lib/appointments/confirm-window";
import {
  findUsersByMobiles,
  notifyUsers,
  type NotifyInput,
} from "@/lib/notifications/notify";
import { formatIstTime, istDisplayDate } from "@/lib/utils/ist";

const BATCH_SIZE = 80;
/** Look back so a missed cron tick still catches open windows. */
const LOOKBACK_HOURS = 6;

export type ConfirmRemindJobResult = {
  total: number;
  reminded: number;
  skipped: number;
  notifiedRecipients: number;
  hasMore: boolean;
};

function whenLabel(scheduledAt: Date): string {
  return `${istDisplayDate(scheduledAt)} ${formatIstTime(scheduledAt)}`;
}

async function findPortalClientUser(clientUnitId: string) {
  return prisma.user.findFirst({
    where: {
      isActive: true,
      roles: { has: "client" },
      OR: [{ clientUnitId }, { unitId: clientUnitId }],
    },
    select: { id: true, unitId: true },
  });
}

/**
 * Notify client portal user + advocate that Confirm coming is available.
 * Marks confirmRemindedAt so each appointment is nudged once.
 */
export async function sendConfirmWindowReminders(
  appointment: Appointment,
  opts?: { excludeUserId?: string }
): Promise<{ notified: number; marked: boolean }> {
  if (
    !canShowConfirmButton({
      status: appointment.status,
      confirmedAt: appointment.confirmedAt,
      scheduledAt: appointment.scheduledAt,
      durationMin: appointment.durationMin,
    })
  ) {
    return { notified: 0, marked: false };
  }
  if (appointment.confirmRemindedAt) {
    return { notified: 0, marked: false };
  }

  const when = whenLabel(appointment.scheduledAt);
  const body = `${appointment.title} · ${when}`;
  const recipients: NotifyInput[] = [];

  if (appointment.clientUnitId) {
    const portal = await findPortalClientUser(appointment.clientUnitId);
    if (portal && portal.id !== opts?.excludeUserId) {
      recipients.push({
        userId: portal.id,
        userUnitId: portal.unitId,
        type: "appointment",
        title: "Confirm your appointment",
        body,
        href: "/appointments",
        meta: {
          appointmentUnitId: appointment.unitId,
          kind: "confirm_window",
        },
      });
    }
  }

  if (appointment.advocateMobile) {
    const advocates = await findUsersByMobiles([appointment.advocateMobile]);
    for (const a of advocates) {
      if (a.id === opts?.excludeUserId) continue;
      recipients.push({
        userId: a.id,
        userUnitId: a.unitId,
        type: "appointment",
        title: "Confirm client coming",
        body,
        href: "/appointments",
        meta: {
          appointmentUnitId: appointment.unitId,
          kind: "confirm_window",
        },
      });
    }
  }

  if (recipients.length) {
    await notifyUsers(recipients);
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { confirmRemindedAt: new Date() },
  });

  return { notified: recipients.length, marked: true };
}

export async function runAppointmentConfirmRemindJob(): Promise<ConfirmRemindJobResult> {
  const now = new Date();
  const windowHours = getConfirmWindowHours();
  const windowMs = windowHours * 60 * 60 * 1000;
  const lookbackMs = LOOKBACK_HOURS * 60 * 60 * 1000;

  // Window open: scheduledAt <= now + windowHours
  // Slot not long past: scheduledAt >= now - lookback
  const due = await prisma.appointment.findMany({
    where: {
      status: "scheduled",
      AND: [
        { OR: [{ confirmedAt: null }, { confirmedAt: { isSet: false } }] },
        {
          OR: [
            { confirmRemindedAt: null },
            { confirmRemindedAt: { isSet: false } },
          ],
        },
        {
          scheduledAt: {
            lte: new Date(now.getTime() + windowMs),
            gte: new Date(now.getTime() - lookbackMs),
          },
        },
      ],
    },
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE + 1,
  });

  const hasMore = due.length > BATCH_SIZE;
  const batch = due.slice(0, BATCH_SIZE);

  let reminded = 0;
  let skipped = 0;
  let notifiedRecipients = 0;

  for (const apt of batch) {
    // Skip if slot already ended (window closed)
    if (
      !canShowConfirmButton({
        status: apt.status,
        confirmedAt: apt.confirmedAt,
        scheduledAt: apt.scheduledAt,
        durationMin: apt.durationMin,
        now,
      })
    ) {
      skipped += 1;
      continue;
    }

    const result = await sendConfirmWindowReminders(apt);
    if (result.marked) {
      reminded += 1;
      notifiedRecipients += result.notified;
    } else {
      skipped += 1;
    }
  }

  return {
    total: batch.length,
    reminded,
    skipped,
    notifiedRecipients,
    hasMore,
  };
}
