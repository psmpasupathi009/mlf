import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { AccountsPage } from "@/features/accounts/components/accounts-page";
import { isModuleEnabled } from "@/config/company/modules";

export default async function Page() {
  const user = await getSessionUser();
  if (
    !user ||
    !isModuleEnabled("accounts") ||
    !user.permissions.includes("accounts.view")
  ) {
    return <ForbiddenState />;
  }
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <AccountsPage user={user} />
    </Suspense>
  );
}
