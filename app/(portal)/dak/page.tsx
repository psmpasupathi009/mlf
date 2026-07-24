import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { DakPage } from "@/features/dak/components/dak-page";
import { isModuleEnabled } from "@/config/company/modules";

export default async function Page() {
  const user = await getSessionUser();
  if (
    !user ||
    !isModuleEnabled("dak") ||
    !user.permissions.includes("dak.view")
  ) {
    return <ForbiddenState />;
  }
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <DakPage user={user} />
    </Suspense>
  );
}
