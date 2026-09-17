import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { requireUserId, handler, json, ApiError } from "@/lib/api";
import { setActiveHousehold } from "@/lib/auth";
import { normalizeJoinCode } from "@/lib/code";

const schema = z.object({ code: z.string().trim().min(4, "Enter the 6-character code") });

export const POST = handler(async (req: Request) => {
  const userId = await requireUserId();
  const code = normalizeJoinCode(schema.parse(await req.json()).code);

  const [household] = await db.select().from(households).where(eq(households.code, code)).limit(1);
  if (!household) throw new ApiError("No flat found with that code. Check it and try again.", 404);

  const [already] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, household.id), eq(householdMembers.userId, userId)))
    .limit(1);

  if (!already) {
    await db.insert(householdMembers).values({ householdId: household.id, userId });
  }
  await setActiveHousehold(household.id);

  return json({ household, alreadyMember: Boolean(already) });
});
