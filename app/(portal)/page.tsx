import { Suspense } from "react";
import { WelcomeOverview } from "@/features/home/components/welcome-overview";
import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { isModuleEnabled } from "@/config/company/modules";
import { prisma } from "@/lib/db/prisma";
import { buildDashboardSummary } from "@/features/home/server/dashboard-summary";
import type { DashboardSummary } from "@/features/home/components/welcome-helpers";

/** Session is request-cached with layout — one DB read per navigation. */
export default async function HomePage() {
  const user = await getSessionUser();
  if (
    !user ||
    !isModuleEnabled("dashboard") ||
    !(user.permissions ?? []).includes("dashboard.view")
  ) {
    return <ForbiddenState />;
  }

  const dbUser = await prisma.user.findUnique({
    where: { unitId: user.unitId },
    select: { id: true, roles: true, unitId: true },
  });

  let initialSummary: DashboardSummary | null = null;
  if (dbUser) {
    try {
      initialSummary = (await buildDashboardSummary({
        ...dbUser,
        permissions: user.permissions,
      })) as DashboardSummary;
    } catch {
      initialSummary = null;
    }
  }

  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <WelcomeOverview user={user} initialSummary={initialSummary} />
    </Suspense>
  );
}
