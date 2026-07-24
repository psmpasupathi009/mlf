import type { AppModule } from "@/config/company/modules";

export type NavGroupId =
  | "workspace"
  | "matters"
  | "schedule"
  | "office"
  | "admin";

export type NavItem = {
  href: string;
  label: string;
  module: AppModule;
  group: NavGroupId;
  /** At least one of these permissions is required to show the item. */
  permission: { module: string; action: string };
};

export const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  workspace: "Workspace",
  matters: "Matters",
  schedule: "Schedule",
  office: "Office",
  admin: "Admin",
};

/** Stable order for section rendering. */
export const NAV_GROUP_ORDER: NavGroupId[] = [
  "workspace",
  "matters",
  "schedule",
  "office",
  "admin",
];

export const navItems: NavItem[] = [
  {
    href: "/",
    label: "Home",
    module: "dashboard",
    group: "workspace",
    permission: { module: "dashboard", action: "view" },
  },
  {
    href: "/clients",
    label: "Clients",
    module: "clients",
    group: "matters",
    permission: { module: "clients", action: "view" },
  },
  {
    href: "/cases",
    label: "Cases",
    module: "cases",
    group: "matters",
    permission: { module: "cases", action: "view" },
  },
  {
    href: "/diary",
    label: "Day board",
    module: "cases",
    group: "matters",
    permission: { module: "cases", action: "view" },
  },
  {
    href: "/appointments",
    label: "Appointments",
    module: "appointments",
    group: "schedule",
    permission: { module: "appointments", action: "view" },
  },
  {
    href: "/availability",
    label: "Availability",
    module: "appointments",
    group: "schedule",
    permission: { module: "appointments", action: "view" },
  },
  {
    href: "/accounts",
    label: "Accounts",
    module: "accounts",
    group: "office",
    permission: { module: "accounts", action: "view" },
  },
  {
    href: "/hrms",
    label: "HRMS",
    module: "hrms",
    group: "office",
    permission: { module: "hrms", action: "view" },
  },
  {
    href: "/dak",
    label: "Dak / Postal",
    module: "dak",
    group: "office",
    permission: { module: "dak", action: "view" },
  },
  {
    href: "/tasks",
    label: "Work allotment",
    module: "tasks",
    group: "office",
    permission: { module: "tasks", action: "view" },
  },
  {
    href: "/reports",
    label: "Reports",
    module: "reports",
    group: "office",
    permission: { module: "reports", action: "view" },
  },
  {
    href: "/employees",
    label: "Employees",
    module: "employees",
    group: "admin",
    permission: { module: "employees", action: "view" },
  },
  {
    href: "/permissions",
    label: "Permissions",
    module: "permissions",
    group: "admin",
    permission: { module: "permissions", action: "view" },
  },
];
