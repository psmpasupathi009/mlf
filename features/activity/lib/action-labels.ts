/** Human labels for AuditLog.action values — allowlist only. */
export const ACTION_LABELS: Record<string, string> = {
  "client.create": "Created client",
  "client.update": "Updated client",
  "client.import": "Imported clients",
  "case.create": "Created case",
  "case.update": "Updated case",
  "case.status": "Changed case status",
  "case.import": "Imported cases",
  "hearing.create": "Added hearing",
  "hearing.adjourn": "Adjourned hearing",
  "hearings.import": "Imported hearings",
  "hearing.sms_manual": "Sent hearing SMS",
  "employee.create": "Created employee",
  "employee.update": "Updated employee",
  "employee.import": "Imported employees",
  "employee.deactivate": "Deactivated employee",
  "employee.reactivate": "Reactivated employee",
  "employee.force_reset_pin": "Forced PIN reset",
  "document.upload": "Uploaded document",
  "document.delete": "Deleted document",
  "payment.create": "Created payment",
  "payment.update": "Updated payment",
  "payment.void": "Voided payment",
  "payment.import": "Imported payments",
  "appointment.create": "Created appointment",
  "appointment.update": "Updated appointment",
  "appointment.cancel": "Cancelled appointment",
  "appointment.convert_case": "Converted appointment to case",
  "appointment.import": "Imported appointments",
  "task.create": "Created task",
  "task.update": "Updated task",
  "task.import": "Imported tasks",
  "dak.create": "Created dak entry",
  "dak.update": "Updated dak entry",
  "dak.delete": "Deleted dak entry",
  "dak.import": "Imported dak",
  "leave.apply": "Applied for leave",
  "leave.approved": "Approved leave",
  "leave.rejected": "Rejected leave",
  "leave.cancel": "Cancelled leave",
  "holiday.create": "Created office holiday",
  "holiday.update": "Updated office holiday",
  "holiday.delete": "Deleted office holiday",
  "permissions.matrix_update": "Updated permissions matrix",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/\./g, " · ").replace(/_/g, " ");
}

/** Portal href for a logged entity when known. */
export function entityHref(
  entity: string,
  entityUnitId: string | null | undefined,
  meta?: unknown
): string | null {
  if (!entityUnitId) return null;

  switch (entity) {
    case "Client":
      return `/clients/${entityUnitId}`;
    case "Case":
      return `/cases/${entityUnitId}`;
    case "User":
      return `/employees`;
    case "CashPayment":
      return `/accounts`;
    case "LeaveRequest":
    case "OfficeHoliday":
      return `/hrms`;
    case "OfficeTask":
      return `/tasks`;
    case "DakEntry":
      return `/dak`;
    case "Appointment":
      return `/appointments`;
    case "Hearing": {
      const caseUnitId = hearingCaseUnitId(meta);
      return caseUnitId ? `/cases/${caseUnitId}` : `/diary`;
    }
    case "Document":
      return null;
    default:
      return null;
  }
}

function hearingCaseUnitId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const record = meta as Record<string, unknown>;
  if (typeof record.caseUnitId === "string") return record.caseUnitId;
  const after = record.after;
  if (after && typeof after === "object" && !Array.isArray(after)) {
    const caseUnitId = (after as Record<string, unknown>).caseUnitId;
    if (typeof caseUnitId === "string") return caseUnitId;
  }
  return null;
}

export const ENTITY_OPTIONS = [
  "Client",
  "Case",
  "User",
  "Document",
  "CashPayment",
  "Appointment",
  "OfficeTask",
  "DakEntry",
  "LeaveRequest",
  "OfficeHoliday",
  "Hearing",
] as const;
