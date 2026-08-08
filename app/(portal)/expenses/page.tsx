import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { ExpensesPage } from "@/features/expenses/components/expenses-page";
import { isModuleEnabled } from "@/config/company/modules";

export default async function Page() {
  const user = await getSessionUser();
  if (
    !user ||
    !isModuleEnabled("expenses") ||
    !user.permissions.includes("expenses.view")
  ) {
    return <ForbiddenState />;
  }
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <ExpensesPage user={user} />
    </Suspense>
  );
}
