import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries, votes, users } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// 0 means "take my vote back".
const schema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { userId, household } = await requireContext();
  const { id } = await ctx.params;
  const { value } = schema.parse(await req.json());

  const [entry] = await db
    .select({ id: planEntries.id })
    .from(planEntries)
    .where(and(eq(planEntries.id, id), eq(planEntries.householdId, household.id)))
    .limit(1);
  if (!entry) throw new ApiError("That meal is not on the plan any more", 404);

  if (value === 0) {
    await db.delete(votes).where(and(eq(votes.planEntryId, id), eq(votes.userId, userId)));
  } else {
    await db
      .insert(votes)
      .values({ planEntryId: id, userId, value })
      .onConflictDoUpdate({ target: [votes.planEntryId, votes.userId], set: { value } });
  }

  const all = await db
    .select({ userId: votes.userId, value: votes.value, name: users.name, emoji: users.emoji })
    .from(votes)
    .leftJoin(users, eq(users.id, votes.userId))
    .where(eq(votes.planEntryId, id));

  return json({
    myVote: all.find((v) => v.userId === userId)?.value ?? 0,
    upVotes: all.filter((v) => v.value > 0).length,
    downVotes: all.filter((v) => v.value < 0).length,
    voters: all,
  });
});
