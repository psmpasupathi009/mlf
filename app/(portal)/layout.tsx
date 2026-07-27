import { redirect } from "next/navigation";
import { AppShell } from "@/shared/components/layout/app-shell";
import { SessionRefreshGate } from "@/features/auth/components/session-refresh-gate";
import { DbUnavailable } from "@/features/auth/components/db-unavailable";
import {
  getSessionUser,
  hasRefreshCookie,
} from "@/lib/auth/session-user";
import { isDbUnreachableError } from "@/lib/db/prisma";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
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
  } catch (error) {
    // Valid JWT + Atlas down must not look like logout (refresh loop / cookie clear).
    if (isDbUnreachableError(error)) {
      return (
        <div className="flex min-h-full flex-1 flex-col bg-muted/30">
          <DbUnavailable />
        </div>
      );
    }
    throw error;
  }
}
