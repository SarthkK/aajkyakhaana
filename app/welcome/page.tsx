import { redirect } from "next/navigation";
import { getUserId, getActiveHousehold, getCurrentUser } from "@/lib/auth";
import { WelcomeScreen } from "@/components/WelcomeScreen";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const [user, household] = await Promise.all([getCurrentUser(), getActiveHousehold(userId)]);
  if (household) redirect("/today");

  return <WelcomeScreen name={user?.name ?? ""} />;
}
