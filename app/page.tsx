import { redirect } from "next/navigation";
import { getUserId, getActiveHousehold } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Root() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const household = await getActiveHousehold(userId);
  if (!household) redirect("/welcome");

  redirect("/today");
}
