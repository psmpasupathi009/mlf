import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Gavel,
  Landmark,
  Plane,
  Scale,
  UserCheck,
} from "lucide-react";

const TYPE_ICONS: Record<string, LucideIcon> = {
  leave_request: Plane,
  leave_decided: UserCheck,
  task_assigned: ClipboardList,
  task_done: CheckCircle2,
  appointment: Calendar,
  case_status: Briefcase,
  filing_defect: FileWarning,
  batta_due: Landmark,
  hearing_tomorrow: Gavel,
  office_holiday: Calendar,
  system: Scale,
};

export function typeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? Bell;
}
