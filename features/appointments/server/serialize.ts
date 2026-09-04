import type { Appointment } from "@prisma/client";
import { displayMobile as stripMobile } from "@/lib/auth/mobile";
import {
  canShowConfirmButton,
  getConfirmWindowHours,
} from "@/lib/appointments/confirm-window";

export type AppointmentSummary = {
  unitId: string;
  clientUnitId: string | null;
  clientName: string | null;
  caseUnitId: string | null;
  advocateMobile: string | null;
  advocateName: string | null;
  advocatePhotoUrl?: string | null;
  advocateUnitId?: string | null;
  title: string;
  scheduledAt: string;
  durationMin: number;
  mode: string;
  location: string | null;
  notes: string | null;
  status: string;
  confirmedAt: string | null;
  confirmedByUnitId: string | null;
  confirmedByRole: string | null;
  /** Server-computed: show Confirm coming button */
  canConfirm: boolean;
  confirmWindowHours: number;
  createdAt: string;
};

export function toAppointmentSummary(
  item: Appointment,
  extras?: {
    clientName?: string | null;
    advocateName?: string | null;
    advocatePhotoUrl?: string | null;
    advocateUnitId?: string | null;
  }
): AppointmentSummary {
  const confirmedAt = item.confirmedAt?.toISOString() ?? null;
  return {
    unitId: item.unitId,
    clientUnitId: item.clientUnitId,
    clientName: extras?.clientName ?? null,
    caseUnitId: item.caseUnitId,
    advocateMobile: stripMobile(item.advocateMobile ?? "") || null,
    advocateName: extras?.advocateName ?? null,
    advocatePhotoUrl: extras?.advocatePhotoUrl ?? null,
    advocateUnitId: extras?.advocateUnitId ?? null,
    title: item.title,
    scheduledAt: item.scheduledAt.toISOString(),
    durationMin: item.durationMin,
    mode: item.mode ?? "office",
    location: item.location,
    notes: item.notes,
    status: item.status,
    confirmedAt,
    confirmedByUnitId: item.confirmedByUnitId ?? null,
    confirmedByRole: item.confirmedByRole ?? null,
    canConfirm: canShowConfirmButton({
      status: item.status,
      confirmedAt: item.confirmedAt,
      scheduledAt: item.scheduledAt,
      durationMin: item.durationMin,
    }),
    confirmWindowHours: getConfirmWindowHours(),
    createdAt: item.createdAt.toISOString(),
  };
}
