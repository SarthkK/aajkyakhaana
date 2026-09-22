import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { shoppingItems } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { addStock, removeStock } from "@/lib/services/pantry";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  quantity: z.coerce.number().min(0).max(100000).nullable().optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  category: z.string().trim().max(20).optional(),
  note: z.string().trim().max(200).nullable().optional(),
  checked: z.boolean().optional(),
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { userId, household } = await requireContext();
  const { id } = await ctx.params;

  const [existing] = await db
    .select()
    .from(shoppingItems)
    .where(and(eq(shoppingItems.id, id), eq(shoppingItems.householdId, household.id)))
    .limit(1);
  if (!existing) throw new ApiError("That item is gone", 404);

  const patch = patchSchema.parse(await req.json());
  const values: Record<string, unknown> = { ...patch };
  if (patch.quantity !== undefined) values.quantity = patch.quantity != null ? String(patch.quantity) : null;
  if (patch.checked !== undefined) {
    // Record who ticked it off, so the flat can see who did the shopping.
    values.checkedBy = patch.checked ? userId : null;
    values.checkedAt = patch.checked ? new Date() : null;
  }

  const [item] = await db.update(shoppingItems).set(values).where(eq(shoppingItems.id, id)).returning();

  // Ticking something off means you bought it, so it is now in the kitchen; unticking
  // means you did not, so take it back out. Only on an actual change of state.
  if (patch.checked !== undefined && patch.checked !== existing.checked) {
    const change = [{
      name: item.name,
      quantity: item.quantity != null ? Number(item.quantity) : null,
      unit: item.unit ?? "piece",
      category: item.category,
    }];
    if (patch.checked) await addStock(household.id, change);
    else await removeStock(household.id, change);
  }

  return json({ item });
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  const deleted = await db
    .delete(shoppingItems)
    .where(and(eq(shoppingItems.id, id), eq(shoppingItems.householdId, household.id)))
    .returning({ id: shoppingItems.id });
  if (!deleted.length) throw new ApiError("That item is gone", 404);
  return json({ ok: true });
});
