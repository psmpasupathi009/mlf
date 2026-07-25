import type { NotificationType } from "@/lib/notifications/sse-hub";

export type NotificationCategory =
  | "hearings"
  | "tasks"
  | "leave"
  | "cases"
  | "system";

export type UrgencyTone = "danger" | "warning" | "info";

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "hearings",
  "tasks",
  "leave",
  "cases",
  "system",
] as const;

const CATEGORY_TYPES: Record<NotificationCategory, readonly string[]> = {
  hearings: ["hearing_tomorrow", "appointment"],
  tasks: ["task_assigned", "task_done"],
  leave: ["leave_request", "leave_decided", "office_holiday"],
  cases: ["filing_defect", "batta_due", "case_status"],
  system: ["system"],
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  hearings: "Hearings",
  tasks: "Tasks",
  leave: "Leave",
  cases: "Cases",
  system: "System",
};

/** Soft icon well colors by category — scannable without loud urgency chrome. */
export const CATEGORY_ICON_CLASS: Record<NotificationCategory, string> = {
  hearings: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  tasks: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  leave: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  cases: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  system: "bg-muted text-muted-foreground",
};

export function typesForCategory(category: NotificationCategory): string[] {
  return [...CATEGORY_TYPES[category]];
}

export function categoryForType(type: string): NotificationCategory {
  for (const cat of NOTIFICATION_CATEGORIES) {
    if (CATEGORY_TYPES[cat].includes(type)) return cat;
  }
  return "system";
}

export function urgencyTone(type: string): UrgencyTone | null {
  if (type === "batta_due" || type === "filing_defect") return "danger";
  if (type === "hearing_tomorrow" || type === "task_assigned") return "warning";
  if (type === "leave_request") return "info";
  return null;
}

const TYPE_LABELS: Record<string, string> = {
  leave_request: "Leave request",
  leave_decided: "Leave decided",
  task_assigned: "Task assigned",
  task_done: "Task done",
  appointment: "Appointment",
  case_status: "Case status",
  filing_defect: "Filing defect",
  batta_due: "Batta due",
  hearing_tomorrow: "Hearing tomorrow",
  office_holiday: "Office holiday",
  system: "System",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function formatNotificationWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function formatRelativeWhen(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return formatNotificationWhen(iso);
  } catch {
    return "";
  }
}

export type DayGroup = "today" | "yesterday" | "earlier";

export function dayGroupFor(iso: string, now = new Date()): DayGroup {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return "today";
  if (date >= startOfYesterday) return "yesterday";
  return "earlier";
}

export const DAY_GROUP_LABELS: Record<DayGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

/** Valid NotificationType values for API validation */
export const ALL_NOTIFICATION_TYPES: readonly NotificationType[] = [
  "leave_request",
  "leave_decided",
  "task_assigned",
  "task_done",
  "appointment",
  "case_status",
  "filing_defect",
  "batta_due",
  "hearing_tomorrow",
  "office_holiday",
  "system",
] as const;
