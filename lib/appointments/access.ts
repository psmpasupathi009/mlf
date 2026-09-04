import type { UserRole } from "@prisma/client";
import { isClientOnlyUser } from "@/lib/auth/client-portal";
import { requireClientUnitId } from "@/lib/auth/client-scope";
import {
  canViewAnyAdvocateDiary,
} from "@/lib/appointments/booking-rules";

export function canAccessAppointment(
  user: {
    roles: UserRole[];
    mobile: string;
    clientUnitId?: string | null;
  },
  item: { advocateMobile: string | null; clientUnitId: string | null }
): boolean {
  if (isClientOnlyUser(user.roles)) {
    const cid = requireClientUnitId(user);
    return Boolean(cid && item.clientUnitId === cid);
  }
  if (canViewAnyAdvocateDiary(user.roles)) return true;
  const ten = user.mobile.replace(/\D/g, "").slice(-10);
  const aptTen = (item.advocateMobile ?? "").replace(/\D/g, "").slice(-10);
  return !aptTen || aptTen === ten;
}
