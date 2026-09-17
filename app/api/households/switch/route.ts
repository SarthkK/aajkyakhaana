import { z } from "zod";
import { requireUserId, handler, json } from "@/lib/api";
import { assertMember, setActiveHousehold } from "@/lib/auth";

const schema = z.object({ householdId: z.string().uuid() });

export const POST = handler(async (req: Request) => {
  const userId = await requireUserId();
  const { householdId } = schema.parse(await req.json());
  await assertMember(userId, householdId);
  await setActiveHousehold(householdId);
  return json({ ok: true });
});
