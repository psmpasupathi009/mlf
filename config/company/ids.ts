export const idConfig = {
  padWidth: 5,
  prefixes: {
    employee: "EMP",
    client: "CLI",
    case: "CSE",
    hearing: "HRG",
    appointment: "APT",
    payment: "PAY",
    document: "DOC",
    leave: "LVE",
    attendance: "ATT",
    weeklyHours: "AWH",
    timeBlock: "ATB",
    dak: "DAK",
    officeTask: "TSK",
    notification: "NTF",
    holiday: "HOL",
  },
} as const;

export type IdEntity = keyof typeof idConfig.prefixes;

export function formatUnitId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(idConfig.padWidth, "0")}`;
}
