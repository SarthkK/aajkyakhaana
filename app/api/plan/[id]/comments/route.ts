import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries, comments, users } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { dishes } from "@/lib/db/schema";
import { notifyInBackground } from "@/lib/services/notifications";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ body: z.string().trim().min(1, "Say something").max(1000) });

async function assertEntry(id: string, householdId: string) {
  const [entry] = await db
    .select({ id: planEntries.id, date: planEntries.date, slot: planEntries.slot, dishName: dishes.name })
    .from(planEntries)
    .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
    .where(and(eq(planEntries.id, id), eq(planEntries.householdId, householdId)))
    .limit(1);
  if (!entry) throw new ApiError("That meal is not on the plan any more", 404);
  return entry;
}

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  await assertEntry(id, household.id);

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      userId: comments.userId,
      name: users.name,
      emoji: users.emoji,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.planEntryId, id))
    .orderBy(asc(comments.createdAt));

  return json({ comments: rows });
});

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { userId, household } = await requireContext();
  const { id } = await ctx.params;
  const entry = await assertEntry(id, household.id);

  const { body } = schema.parse(await req.json());
  const [row] = await db.insert(comments).values({ planEntryId: id, userId, body }).returning();

  const [me] = await db.select({ name: users.name, emoji: users.emoji }).from(users).where(eq(users.id, userId)).limit(1);

  notifyInBackground({
    householdId: household.id,
    actorId: userId,
    kind: "comments",
    notification: {
      title: `${me?.name ?? "Someone"} on ${entry.dishName}`,
      body: body.length > 120 ? `${body.slice(0, 120)}…` : body,
      url: `/day/${entry.date}`,
      tag: `comments:${id}`,
    },
  });

  return json({ comment: { ...row, name: me?.name ?? null, emoji: me?.emoji ?? null } }, 201);
});
