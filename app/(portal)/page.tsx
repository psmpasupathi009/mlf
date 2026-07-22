import { WelcomeOverview } from "@/features/home/components";
import { getSessionUser } from "@/lib/auth/session-user";

/** Session is request-cached with layout — one DB read per navigation. */
export default async function HomePage() {
  const user = await getSessionUser();
  return <WelcomeOverview user={user} />;
}
