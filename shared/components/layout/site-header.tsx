import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "@/features/auth/components/logout-button";
import type { PublicUser } from "@/lib/auth/session";

type SiteHeaderProps = {
  user: PublicUser;
};

export function SiteHeader({ user }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src="/images/mlf.jpeg"
            alt="Manitham Law Foundation"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
            priority
          />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-navy sm:text-base">
              Manitham Law Foundation
            </p>
            <p className="hidden text-xs capitalize text-muted-foreground sm:block">
              {user.role.replace("_", " ")}
            </p>
          </div>
        </Link>

        <nav className="flex shrink-0 items-center gap-3 sm:gap-4">
          <div className="hidden text-right text-sm sm:block">
            <p className="font-medium text-navy">{user.name || "Signed in"}</p>
            <p className="text-xs text-muted-foreground">+{user.mobile}</p>
          </div>
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
