/**
 * Appointment RSVP confirm window — env-driven hours before slot start
 * until slot end. Default 1 hour.
 */

import { formatIstTime, istDisplayDate } from "@/lib/utils/ist";

export function getConfirmWindowHours(): number {
  const raw = process.env.APPOINTMENT_CONFIRM_WINDOW_HOURS?.trim();
  const n = raw ? Number(raw) : 1;
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.min(168, n); // cap at 1 week
}

export function isInConfirmWindow(
  scheduledAt: Date,
  durationMin: number,
  now: Date = new Date()
): boolean {
  const hours = getConfirmWindowHours();
  const windowStart = new Date(scheduledAt.getTime() - hours * 60 * 60 * 1000);
  const durationMs = Math.max(1, durationMin || 30) * 60 * 1000;
  const windowEnd = new Date(scheduledAt.getTime() + durationMs);
  return now >= windowStart && now <= windowEnd;
}

export function canShowConfirmButton(input: {
  status: string;
  confirmedAt: Date | string | null | undefined;
  scheduledAt: Date | string;
  durationMin: number;
  now?: Date;
}): boolean {
  if (input.status !== "scheduled") return false;
  if (input.confirmedAt) return false;
  const scheduledAt =
    input.scheduledAt instanceof Date
      ? input.scheduledAt
      : new Date(input.scheduledAt);
  return isInConfirmWindow(scheduledAt, input.durationMin, input.now);
}

/** Shared copy for appointment notification bodies. */
export function appointmentWhenBody(title: string, scheduledAt: Date): string {
  return `${title} · ${istDisplayDate(scheduledAt)} ${formatIstTime(scheduledAt)}`;
}
