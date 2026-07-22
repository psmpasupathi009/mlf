import type { AppModule } from "@/config/company/modules";

export type NavItem = {
  href: string;
  label: string;
  module: AppModule;
  /** At least one of these permissions is required to show the item. */
  permission: { module: string; action: string };
};

export const navItems: NavItem[] = [
  {
    href: "/",
    label: "Home",
    module: "dashboard",
    permission: { module: "dashboard", action: "view" },
  },
  {
    href: "/employees",
    label: "Employees",
    module: "employees",
    permission: { module: "employees", action: "view" },
  },
  {
    href: "/permissions",
    label: "Permissions",
    module: "permissions",
    permission: { module: "permissions", action: "view" },
  },
  {
    href: "/clients",
    label: "Clients",
    module: "clients",
    permission: { module: "clients", action: "view" },
  },
  {
    href: "/cases",
    label: "Cases",
    module: "cases",
    permission: { module: "cases", action: "view" },
  },
  {
    href: "/diary",
    label: "Diary",
    module: "cases",
    permission: { module: "cases", action: "view" },
  },
  {
    href: "/accounts",
    label: "Accounts",
    module: "accounts",
    permission: { module: "accounts", action: "view" },
  },
  {
    href: "/appointments",
    label: "Appointments",
    module: "appointments",
    permission: { module: "appointments", action: "view" },
  },
  {
    href: "/availability",
    label: "Availability",
    module: "appointments",
    permission: { module: "appointments", action: "view" },
  },
  {
    href: "/hrms",
    label: "HRMS",
    module: "hrms",
    permission: { module: "hrms", action: "view" },
  },
];
