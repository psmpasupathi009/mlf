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
          <SessionRefreshGate />
        </div>
      );
    }
    // Clears leftover access JWT (e.g. deactivated user) then → /login
    redirect("/api/v1/auth/session-expired");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
