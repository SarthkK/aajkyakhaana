import { redirect } from "next/navigation";
import { getCurrentUser, getActiveHousehold } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Root() {
  // getCurrentUser, not getUserId: a cookie can outlive the account behind it.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const household = await getActiveHousehold(user.id);
  if (!household) redirect("/welcome");

  redirect("/today");
}
