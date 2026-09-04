import type { Appointment } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  appointmentWhenBody,
  canShowConfirmButton,
  getConfirmWindowHours,
} from "@/lib/appointments/confirm-window";
import {
  findPortalClientUser,
  unsetOrNullDateWhere,
} from "@/lib/appointments/portal-client";
import {
  findUsersByMobiles,
  notifyUsers,
  type NotifyInput,
} from "@/lib/notifications/notify";

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

type ReminderOpts = { excludeUserId?: string };

async function buildConfirmWindowRecipients(
  appointment: Appointment,
  opts?: ReminderOpts
): Promise<NotifyInput[]> {
  const body = appointmentWhenBody(appointment.title, appointment.scheduledAt);
  const meta = {
    appointmentUnitId: appointment.unitId,
    kind: "confirm_window",
  };
  const exclude = opts?.excludeUserId;

  const [portal, advocates] = await Promise.all([
    appointment.clientUnitId
      ? findPortalClientUser(appointment.clientUnitId)
      : Promise.resolve(null),
    appointment.advocateMobile
      ? findUsersByMobiles([appointment.advocateMobile])
      : Promise.resolve([]),
  ]);

  const recipients: NotifyInput[] = [];

  if (portal && portal.id !== exclude) {
    recipients.push({
      userId: portal.id,
      userUnitId: portal.unitId,
      type: "appointment",
      title: "Confirm your appointment",
      body,
      href: "/appointments",
      meta,
    });
  }

  for (const a of advocates) {
    if (a.id === exclude) continue;
    recipients.push({
      userId: a.id,
      userUnitId: a.unitId,
      type: "appointment",
      title: "Confirm client coming",
      body,
      href: "/appointments",
      meta,
    });
  }

  return recipients;
}

/**
 * Notify client portal + advocate that Confirm coming is available.
 * Marks confirmRemindedAt so each appointment is nudged once.
 */
export async function sendConfirmWindowReminders(
  appointment: Appointment,
  opts?: ReminderOpts
): Promise<{ notified: number; marked: boolean }> {
  if (appointment.confirmRemindedAt) {
    return { notified: 0, marked: false };
  }
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

  const recipients = await buildConfirmWindowRecipients(appointment, opts);
  if (recipients.length) await notifyUsers(recipients);

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { confirmRemindedAt: new Date() },
  });

  return { notified: recipients.length, marked: true };
}

export async function runAppointmentConfirmRemindJob(): Promise<ConfirmRemindJobResult> {
  const now = new Date();
  const windowMs = getConfirmWindowHours() * 60 * 60 * 1000;
  const lookbackMs = LOOKBACK_HOURS * 60 * 60 * 1000;

  const due = await prisma.appointment.findMany({
    where: {
      status: "scheduled",
      AND: [
        unsetOrNullDateWhere("confirmedAt"),
        unsetOrNullDateWhere("confirmRemindedAt"),
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
