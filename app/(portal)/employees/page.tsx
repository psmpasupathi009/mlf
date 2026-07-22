import { getSessionUser } from "@/lib/auth/session-user";
import { ForbiddenState } from "@/shared/components/feedback/forbidden-state";
import { EmployeesPage } from "@/features/employees/components/employees-page";
import { isModuleEnabled } from "@/config/company/modules";

export default async function Page() {
  const user = await getSessionUser();
  if (
    !user ||
    !isModuleEnabled("employees") ||
    !user.permissions.includes("employees.view")
  ) {
    return <ForbiddenState />;
  }
  return <EmployeesPage user={user} />;
}
