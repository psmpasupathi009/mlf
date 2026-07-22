"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Home,
  Scale,
  Shield,
  Users,
  Wallet,
  CalendarDays,
  ClipboardList,
  Clock3,
} from "lucide-react";
import { navItems } from "@/config/company/nav";
import { isModuleEnabled, type AppModule } from "@/config/company/modules";
import type { PublicUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { useUiStore } from "@/shared/stores/ui-store";

const ICONS: Partial<
  Record<AppModule | string, React.ComponentType<{ className?: string }>>
> = {
  dashboard: Home,
  employees: Users,
  permissions: Shield,
  clients: Briefcase,
  cases: Scale,
  accounts: Wallet,
  appointments: CalendarDays,
  hrms: ClipboardList,
};

function iconForHref(href: string, module: AppModule) {
  if (href === "/availability") return Clock3;
  return ICONS[module] ?? Home;
}

type SiteSidebarProps = {
  user: PublicUser;
};

export function SiteSidebar({ user }: SiteSidebarProps) {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const perms = new Set(user.permissions);

  const items = navItems.filter((item) => {
    if (!isModuleEnabled(item.module)) return false;
    return perms.has(`${item.permission.module}.${item.permission.action}`);
  });

  if (items.length === 0) return null;

  const nav = (
    <nav className="flex flex-col gap-0.5 p-2 sm:p-3">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const Icon = iconForHref(item.href, item.module);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors md:gap-3 md:px-3",
              active
                ? "bg-navy text-white shadow-sm"
                : "text-foreground/70 hover:bg-muted hover:text-navy"
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "opacity-100" : "opacity-70"
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Phone drawer — below md */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          sidebarOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          className={cn(
            "absolute inset-0 bg-navy/30 transition-opacity",
            sidebarOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setSidebarOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(17rem,90vw)] flex-col border-r border-border bg-white pt-[env(safe-area-inset-top)] shadow-xl transition-transform duration-200",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="border-b border-border px-4 py-4">
            <p className="text-sm font-semibold text-navy">Menu</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
        </aside>
      </div>

      {/* Tablet + desktop rail — from md */}
      <aside className="hidden w-48 shrink-0 border-r border-border/80 bg-white md:block lg:w-56">
        <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto py-2">
          {nav}
        </div>
      </aside>
    </>
  );
}
