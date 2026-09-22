import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dishes, messages, planEntries, pollVotes, votes } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { recordEvent } from "@/lib/services/chat";
import { publish, REALTIME_EVENTS } from "@/lib/realtime/server";
import { friendlyDate, todayIn, SLOT_LABELS, type Slot } from "@/lib/dates";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

const log = logger("chat.poll.resolve");

/**
 * Puts the winning option on the plan.
 *
 * Most votes wins; a tie goes to whichever was listed first, which is the same rule
 * the plan itself uses for a contested slot — one predictable way of settling things
 * rather than two.
 */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const { userId, household } = await requireContext();
  const messageId = Number((await ctx.params).id);
  if (!Number.isFinite(messageId)) throw new ApiError("Bad poll", 400);

  const [poll] = await db
    .select({ meta: messages.meta })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.householdId, household.id), eq(messages.kind, "poll")))
    .limit(1);

  if (!poll?.meta?.options?.length) throw new ApiError("That vote is gone", 404);
  if (poll.meta.resolvedDish) throw new ApiError("Already settled", 409);

  const cast = await db.select({ optionIndex: pollVotes.optionIndex }).from(pollVotes).where(eq(pollVotes.messageId, messageId));
  const tally = poll.meta.options.map((_, i) => cast.filter((v) => v.optionIndex === i).length);
  const winnerIndex = tally.indexOf(Math.max(...tally));
  const winner = poll.meta.options[winnerIndex];

  const date = poll.meta.pollDate ?? todayIn(household.timezone);
  const slot = (poll.meta.pollSlot ?? "dinner") as Slot;

  // Reuse a saved dish of the same name rather than creating a duplicate.
  const [existing] = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(and(eq(dishes.householdId, household.id), eq(dishes.name, winner.name)))
    .limit(1);

  let dishId = existing?.id;
  let createdDish: { id: string; name: string } | null = null;

  if (!dishId) {
    const [created] = await db
      .insert(dishes)
      .values({
        householdId: household.id,
        name: winner.name,
        course: slot === "snack" ? "snack" : slot,
        isVeg: winner.isVeg,
        createdBy: userId,
        enrichStatus: "pending",
      })
      .returning();
    dishId = created.id;
    createdDish = { id: created.id, name: created.name };
  }

  const [entry] = await db
    .insert(planEntries)
    .values({ householdId: household.id, date, slot, dishId, addedBy: userId, suggested: true })
    .onConflictDoNothing()
    .returning();

  if (entry) {
    await db.insert(votes).values({ planEntryId: entry.id, userId, value: 1 }).onConflictDoNothing();
  }

  await db
    .update(messages)
    .set({ meta: { ...poll.meta, resolvedDish: winner.name } })
    .where(eq(messages.id, messageId));

  const when = friendlyDate(date, todayIn(household.timezone)).toLowerCase();
  recordEvent({
    householdId: household.id,
    userId,
    kind: "meal_settled",
    body: `— the flat picked ${winner.name} for ${when}'s ${SLOT_LABELS[slot].toLowerCase()}`,
    planEntryId: entry?.id ?? null,
    meta: { dishName: winner.name, slot, date },
  });

  publish(household.id, REALTIME_EVENTS.feed, {});
  log.info("poll resolved", { householdId: household.id, winner: winner.name, tally });
  return json({ winner: winner.name, tally, createdDish });
});
