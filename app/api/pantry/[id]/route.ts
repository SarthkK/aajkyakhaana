import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pantryItems } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  quantity: z.coerce.number().min(0).max(100000).nullable(),
});

/** Correcting the count after actually looking in the cupboard. */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  const { quantity } = patchSchema.parse(await req.json());

  if (quantity === null || quantity <= 0) {
    await db
      .delete(pantryItems)
      .where(and(eq(pantryItems.id, id), eq(pantryItems.householdId, household.id)));
    return json({ item: null });
  }

  const [item] = await db
    .update(pantryItems)
    .set({ quantity: String(quantity), updatedAt: new Date() })
    .where(and(eq(pantryItems.id, id), eq(pantryItems.householdId, household.id)))
    .returning();

  if (!item) throw new ApiError("That is not in your pantry", 404);
  return json({ item: { ...item, quantity: Number(item.quantity) } });
});

/** Used it up, or it went off. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;

  const removed = await db
    .delete(pantryItems)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.householdId, household.id)))
    .returning({ id: pantryItems.id });

  if (!removed.length) throw new ApiError("That is not in your pantry", 404);
  return json({ ok: true });
});
