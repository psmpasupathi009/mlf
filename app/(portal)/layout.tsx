import { redirect } from "next/navigation";
import { AppShell } from "@/shared/components/layout/app-shell";
import { SessionRefreshGate } from "@/features/auth/components/session-refresh-gate";
import {
  getSessionUser,
  hasRefreshCookie,
} from "@/lib/auth/session-user";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    if (await hasRefreshCookie()) {
      return (
        <div className="flex min-h-full flex-1 flex-col bg-muted/30">
          <SessionRefreshGate>
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Loading portal…
            </div>
          </SessionRefreshGate>
        </div>
      );
    }
    redirect("/login");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
