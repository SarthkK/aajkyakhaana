import { redirect } from "next/navigation";
import { getCurrentUser, getActiveHousehold } from "@/lib/auth";
import { WelcomeScreen } from "@/components/WelcomeScreen";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const household = await getActiveHousehold(user.id);
  if (household) redirect("/today");

  return <WelcomeScreen name={user.name} />;
}
