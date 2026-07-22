import { brand } from "@/config/company/brand";
import type { PublicUser } from "@/lib/auth/session";
import { SiteHeader } from "@/shared/components/layout/site-header";
import { SiteFooter } from "@/shared/components/layout/site-footer";
import { SiteSidebar } from "@/shared/components/layout/site-sidebar";

type AppShellProps = {
  user: PublicUser;
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[#f7f8fa]">
      <SiteHeader brandName={brand.name} logoSrc={brand.logoSrc} user={user} />
      <div className="flex min-h-0 w-full flex-1">
        <SiteSidebar user={user} />
        <main className="min-w-0 flex-1 overflow-x-clip pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 sm:py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
