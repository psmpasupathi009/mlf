"use client";

import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/shared/components/theme/theme-toggle";
import { GlobalSearch } from "@/shared/components/layout/global-search";
import { NotificationBell } from "@/shared/components/layout/notification-bell";
import { cn } from "@/lib/utils/cn";

type SiteHeaderProps = {
  brandName: string;
  className?: string;
};

export function SiteHeader({ brandName, className }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 shrink-0 border-b border-border/80 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md",
        className
      )}
    >
      <div className="flex h-12 items-center gap-2 px-3 sm:h-14 sm:px-5 md:px-6 lg:px-8">
        <div className="flex w-[6.75rem] shrink-0 items-center justify-start sm:w-28">
          <SidebarTrigger className="-ml-1" />
        </div>

        <Link
          href="/"
          className="min-w-0 flex-1 truncate text-center text-sm font-semibold uppercase tracking-tight text-navy sm:text-[15px]"
          title={brandName}
        >
          {brandName}
        </Link>

        <div className="flex w-[6.75rem] shrink-0 items-center justify-end gap-0.5 sm:w-28">
          <GlobalSearch />
          <NotificationBell />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
