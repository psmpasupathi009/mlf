import { Suspense } from "react";
import { WelcomeOverview } from "@/features/home/components/welcome-overview";
import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { isModuleEnabled } from "@/config/company/modules";

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
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <WelcomeOverview user={user} />
    </Suspense>
  );
}
