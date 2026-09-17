import { getCurrentUser, getActiveHousehold } from "@/lib/auth";
import { handler, json } from "@/lib/api";

export const GET = handler(async () => {
  const user = await getCurrentUser();
  if (!user) return json({ user: null, household: null });
  const household = await getActiveHousehold(user.id);
  return json({ user, household });
});
