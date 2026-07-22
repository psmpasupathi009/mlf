"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { useUiStore } from "@/shared/stores/ui-store";
import type { PublicUser } from "@/lib/auth/session";
import { UserAvatar } from "@/shared/components/user/user-avatar";

type SiteHeaderProps = {
  brandName: string;
  logoSrc: string;
  user: PublicUser;
};

export function SiteHeader({ brandName, logoSrc, user }: SiteHeaderProps) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const displayName = user.name?.trim() || "Profile";

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex h-12 w-full items-center justify-between gap-2 px-3 sm:h-14 sm:gap-3 sm:px-4 md:px-5 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={toggleSidebar}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>

          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src={logoSrc}
              alt={brandName}
              width={36}
              height={36}
              className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border sm:size-9"
              priority
            />
            <span className="hidden truncate text-sm font-semibold tracking-tight text-navy min-[400px]:inline sm:text-[15px] md:max-w-48 lg:max-w-none">
              {brandName}
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <Link
            href="/profile"
            className="flex max-w-36 items-center gap-1.5 rounded-full py-1 pl-1 pr-1.5 transition-colors hover:bg-muted sm:max-w-44 sm:gap-2 sm:pr-2 md:max-w-56"
            title="My profile"
          >
            <UserAvatar
              name={displayName}
              photoUrl={user.photoUrl}
              size="sm"
            />
            <span className="hidden truncate text-sm font-medium text-navy sm:inline">
              {displayName}
            </span>
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
