import { redirect } from "next/navigation";
import { AppShell } from "@/shared/components/layout/app-shell";
import { DbUnavailable } from "@/features/auth/components/db-unavailable";
import { getSessionUser } from "@/lib/auth/session-user";
import { isDbUnreachableError } from "@/lib/db/prisma";
import type { PublicUser } from "@/lib/auth/session";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: PublicUser | null = null;
  let dbUnreachable = false;

  try {
    user = await getSessionUser();
  } catch (error) {
    // Valid JWT + Atlas down must not look like logout (cookie clear).
    if (isDbUnreachableError(error)) {
      dbUnreachable = true;
    } else {
      throw error;
    }
  }

  if (dbUnreachable) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-muted/30">
        <DbUnavailable />
      </div>
    );
  }

  if (!user) {
    // Clears leftover access JWT (e.g. deactivated user) then → /login
    redirect("/api/v1/auth/session-expired");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
