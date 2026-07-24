import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { DiaryPage } from "@/features/diary/components/diary-page";
import { isModuleEnabled } from "@/config/company/modules";

export default async function DiaryRoutePage() {
  const user = await getSessionUser();
  if (
    !user ||
    !isModuleEnabled("cases") ||
    !(user.permissions ?? []).includes("cases.view")
  ) {
    return <ForbiddenState />;
  }
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <DiaryPage user={user} />
    </Suspense>
  );
}
