import { z } from "zod";
import { eq, and, gte, lte, inArray, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries, dishes, votes, comments, users } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { isValidDate, todayIn, addDays } from "@/lib/dates";

const querySchema = z.object({
  from: z.string().refine(isValidDate, "Bad from date").optional(),
  to: z.string().refine(isValidDate, "Bad to date").optional(),
});

const createSchema = z
  .object({
    date: z.string().refine(isValidDate, "Pick a valid date"),
    slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    dishId: z.string().uuid().optional(),
    /** Used when someone types a brand new dish straight into the day. */
    dishName: z.string().trim().min(1).max(80).optional(),
    servings: z.coerce.number().int().min(1).max(30).optional(),
    note: z.string().trim().max(300).optional(),
    suggested: z.boolean().optional(),
  })
  .refine((v) => v.dishId || v.dishName, { message: "Pick a dish or type a new one" });

export const GET = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const url = new URL(req.url);
  const q = querySchema.parse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const today = todayIn(household.timezone);
  const from = q.from ?? today;
  const to = q.to ?? addDays(from, 6);

  const rows = await db
    .select({
      entry: planEntries,
      dish: dishes,
      addedByName: users.name,
      addedByEmoji: users.emoji,
    })
    .from(planEntries)
    .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
    .leftJoin(users, eq(users.id, planEntries.addedBy))
    .where(
      and(
        eq(planEntries.householdId, household.id),
        gte(planEntries.date, from),
        lte(planEntries.date, to),
      ),
    )
    .orderBy(asc(planEntries.date), asc(planEntries.createdAt));

  const ids = rows.map((r) => r.entry.id);

  const voteRows = ids.length
    ? await db
        .select({ planEntryId: votes.planEntryId, userId: votes.userId, value: votes.value, name: users.name, emoji: users.emoji })
        .from(votes)
        .leftJoin(users, eq(users.id, votes.userId))
        .where(inArray(votes.planEntryId, ids))
    : [];

  const commentRows = ids.length
    ? await db
        .select({ planEntryId: comments.planEntryId })
        .from(comments)
        .where(inArray(comments.planEntryId, ids))
    : [];

  const commentCounts = new Map<string, number>();
  for (const c of commentRows) commentCounts.set(c.planEntryId, (commentCounts.get(c.planEntryId) ?? 0) + 1);

  const entries = rows.map((r) => {
    const mine = voteRows.find((v) => v.planEntryId === r.entry.id && v.userId === userId);
    const all = voteRows.filter((v) => v.planEntryId === r.entry.id);
    return {
      ...r.entry,
      dish: r.dish,
      addedByName: r.addedByName,
      addedByEmoji: r.addedByEmoji,
      myVote: mine?.value ?? 0,
      upVotes: all.filter((v) => v.value > 0).length,
      downVotes: all.filter((v) => v.value < 0).length,
      voters: all.map((v) => ({ userId: v.userId, name: v.name, emoji: v.emoji, value: v.value })),
      commentCount: commentCounts.get(r.entry.id) ?? 0,
    };
  });

  return json({ from, to, today, entries });
});

export const POST = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const input = createSchema.parse(await req.json());

  let dishId = input.dishId;
  let createdDish = null;

  if (!dishId) {
    // New dish typed straight into a day: save it to the library too, ingredients pending.
    const [dish] = await db
      .insert(dishes)
      .values({
        householdId: household.id,
        name: input.dishName!,
        course: input.slot === "snack" ? "snack" : input.slot,
        createdBy: userId,
        enrichStatus: "pending",
      })
      .returning();
    dishId = dish.id;
    createdDish = dish;
  } else {
    const [dish] = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(and(eq(dishes.id, dishId), eq(dishes.householdId, household.id)))
      .limit(1);
    if (!dish) throw new ApiError("That dish is not in your flat's library", 404);
  }

  const [entry] = await db
    .insert(planEntries)
    .values({
      householdId: household.id,
      date: input.date,
      slot: input.slot,
      dishId,
      servings: input.servings ?? null,
      note: input.note ?? null,
      suggested: input.suggested ?? false,
      addedBy: userId,
    })
    .onConflictDoNothing()
    .returning();

  if (!entry) throw new ApiError("That dish is already planned for this meal", 409);

  // Whoever proposes it is assumed to want it.
  await db.insert(votes).values({ planEntryId: entry.id, userId, value: 1 }).onConflictDoNothing();

  return json({ entry, createdDish }, 201);
});
