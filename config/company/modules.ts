/**
 * Feature flags — unfinished modules stay off so nav stays clean.
 * Flip on as each MVP slice ships.
 */
export const modules = {
  enabled: {
    dashboard: true,
    employees: true,
    permissions: true,
    clients: true,
    appointments: true,
    cases: true,
    accounts: true,
    hrms: true,
    dak: true,
    tasks: true,
    reports: false,
  },
} as const;

export type AppModule = keyof typeof modules.enabled;

export function isModuleEnabled(module: AppModule): boolean {
  return modules.enabled[module] === true;
}
