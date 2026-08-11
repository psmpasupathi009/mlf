import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { CoveragePage } from "@/features/hearings/components/coverage-page";
import { isModuleEnabled } from "@/config/company/modules";

export default async function CoverageRoutePage() {
  const user = await getSessionUser();
  const can =
    user &&
    isModuleEnabled("cases") &&
    (user.roles.includes("admin") ||
      user.roles.includes("sub_admin") ||
      user.permissions.includes("cases.edit"));

  if (!user || !can) {
    return <ForbiddenState />;
  }

  return <CoveragePage user={user} />;
}
