import type { Appointment } from "@prisma/client";

export type AppointmentSummary = {
  unitId: string;
  clientUnitId: string | null;
  clientName: string | null;
  advocateMobile: string | null;
  advocateName: string | null;
  title: string;
  scheduledAt: string;
  durationMin: number;
  mode: string;
  location: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

function displayMobile(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  return mobile.startsWith("91") && mobile.length === 12
    ? mobile.slice(2)
    : mobile;
}

export function toAppointmentSummary(
  item: Appointment,
  extras?: { clientName?: string | null; advocateName?: string | null }
): AppointmentSummary {
  return {
    unitId: item.unitId,
    clientUnitId: item.clientUnitId,
    clientName: extras?.clientName ?? null,
    advocateMobile: displayMobile(item.advocateMobile),
    advocateName: extras?.advocateName ?? null,
    title: item.title,
    scheduledAt: item.scheduledAt.toISOString(),
    durationMin: item.durationMin,
    mode: item.mode ?? "office",
    location: item.location,
    notes: item.notes,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
  };
}
