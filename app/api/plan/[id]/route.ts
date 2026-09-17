import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { isValidDate } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  date: z.string().refine(isValidDate).optional(),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  servings: z.coerce.number().int().min(1).max(30).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  status: z.enum(["proposed", "confirmed", "cooked", "cancelled"]).optional(),
});

async function loadEntry(id: string, householdId: string) {
  const [entry] = await db
    .select()
    .from(planEntries)
    .where(and(eq(planEntries.id, id), eq(planEntries.householdId, householdId)))
    .limit(1);
  if (!entry) throw new ApiError("That meal is not on the plan any more", 404);
  return entry;
}

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  await loadEntry(id, household.id);

  const patch = patchSchema.parse(await req.json());
  if (Object.keys(patch).length === 0) throw new ApiError("Nothing to update");

  const [entry] = await db.update(planEntries).set(patch).where(eq(planEntries.id, id)).returning();
  return json({ entry });
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  await loadEntry(id, household.id);
  await db.delete(planEntries).where(eq(planEntries.id, id));
  return json({ ok: true });
});
