/**
 * Office hearing-SMS send window — ENV-driven IST clock time.
 * Vercel cron cannot read .env schedules, so the job runs every 15m and
 * only sends inside this window (default 17:00–17:14 IST).
 */

const IST_TZ = "Asia/Kolkata";
const WINDOW_MINUTES = 14;

export function getHearingSmsTimeIst(): { hour: number; minute: number } {
  const raw = process.env.HEARING_SMS_TIME_IST?.trim() || "17:00";
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return { hour: 17, minute: 0 };
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 17, minute: 0 };
  }
  return { hour, minute };
}

/** Current IST minutes since midnight. */
export function istMinutesSinceMidnight(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Some engines report midnight as 24.
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

/** True when `now` (IST) falls in [HEARING_SMS_TIME_IST, +14 minutes]. */
export function isWithinHearingSmsWindow(now: Date = new Date()): boolean {
  const { hour, minute } = getHearingSmsTimeIst();
  const start = hour * 60 + minute;
  const end = start + WINDOW_MINUTES;
  const cur = istMinutesSinceMidnight(now);
  return cur >= start && cur <= end;
}
