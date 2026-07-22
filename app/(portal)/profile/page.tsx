import { getSessionUser } from "@/lib/auth/session-user";
import { redirect } from "next/navigation";
import { ProfilePage } from "@/features/profile/components/profile-page";

export default async function ProfileRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <ProfilePage user={user} />;
}
