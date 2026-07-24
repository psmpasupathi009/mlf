"use client";

import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/shared/components/theme/theme-toggle";
import { cn } from "@/lib/utils/cn";

type SiteHeaderProps = {
  brandName: string;
  className?: string;
};

export function SiteHeader({ brandName, className }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 grid h-12 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/80 bg-background/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:h-14 sm:px-4",
        className,
      )}
    >
      <SidebarTrigger className="-ml-1 shrink-0" />

      <Link
        href="/"
        className="min-w-0 justify-self-center truncate text-center text-sm font-semibold tracking-tight text-navy sm:text-[15px]"
        title={brandName}
      >
        {brandName}
      </Link>

      <ThemeToggle />
    </header>
  );
}
