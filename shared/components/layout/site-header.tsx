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
        "sticky top-0 z-40 shrink-0 border-b border-border/80 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md",
        className,
      )}
    >
      <div className="grid h-12 grid-cols-[minmax(2.75rem,1fr)_auto_minmax(2.75rem,1fr)] items-center gap-2 px-3 sm:h-14 sm:px-5 md:px-6 lg:px-8">
        <div className="justify-self-start">
          <SidebarTrigger className="-ml-1" />
        </div>

        <Link
          href="/"
          className="min-w-0 max-w-[min(100%,16rem)] truncate text-center text-sm font-semibold tracking-tight text-navy sm:max-w-none sm:text-[15px]"
          title={brandName}
        >
          {brandName}
        </Link>

        <div className="justify-self-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
