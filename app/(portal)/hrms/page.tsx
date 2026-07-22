import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { HrmsPage } from "@/features/hrms/components/hrms-page";
import { isModuleEnabled } from "@/config/company/modules";

export default async function Page() {
  const user = await getSessionUser();
  if (
    !user ||
    !isModuleEnabled("hrms") ||
    !user.permissions.includes("hrms.view")
  ) {
    return <ForbiddenState />;
  }
  return <HrmsPage user={user} />;
}
