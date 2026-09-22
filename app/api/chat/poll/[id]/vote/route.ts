import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, pollVotes } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { publish, REALTIME_EVENTS } from "@/lib/realtime/server";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ option: z.number().int().min(0).max(3) });

/** One pick per person. Tapping a different option moves your vote. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { userId, household } = await requireContext();
  const messageId = Number((await ctx.params).id);
  if (!Number.isFinite(messageId)) throw new ApiError("Bad poll", 400);

  const { option } = schema.parse(await req.json());

  const [poll] = await db
    .select({ meta: messages.meta })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.householdId, household.id), eq(messages.kind, "poll")))
    .limit(1);

  if (!poll) throw new ApiError("That vote is gone", 404);
  if (poll.meta?.resolvedDish) throw new ApiError("That vote is already settled", 409);
  if (option >= (poll.meta?.options?.length ?? 0)) throw new ApiError("No such option", 400);

  await db
    .insert(pollVotes)
    .values({ messageId, userId, optionIndex: option })
    .onConflictDoUpdate({ target: [pollVotes.messageId, pollVotes.userId], set: { optionIndex: option } });

  const votes = await db.select({ optionIndex: pollVotes.optionIndex, userId: pollVotes.userId }).from(pollVotes).where(eq(pollVotes.messageId, messageId));

  const tally = (poll.meta?.options ?? []).map((_, i) => votes.filter((v) => v.optionIndex === i).length);

  // A vote does not move the cursor, so nudge without one — everyone refetches the
  // page and sees the bar move.
  publish(household.id, REALTIME_EVENTS.feed, {});

  return json({ tally, myVote: option });
});
