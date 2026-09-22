import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { pantryItems } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { canonicalIngredient } from "@/lib/ingredients";
import { toBaseUnit } from "@/lib/services/pantry";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  quantity: z.coerce.number().min(0).max(100000).nullable().optional(),
  unit: z.string().trim().max(20).optional(),
  category: z.string().trim().max(20).optional(),
});

/**
 * Correcting a shelf after actually looking at it — the name, the amount, the unit or
 * where it files.
 *
 * Two things make this more than a plain update. Quantities are stored in base units
 * (g, ml, tsp, piece), so a quantity that arrives with a unit is converted the same way
 * `addStock` converts it — editing "500 g" to "0.5 kg" leaves the shelf unchanged rather
 * than multiplying it by a thousand. And rows are unique per
 * (household, canonicalName, unit), so renaming Dhaniya to Coriander can land on a row
 * that already exists; those are added together rather than rejected, which is what
 * ticking the same thing off the shopping list twice already does.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  const patch = patchSchema.parse(await req.json());

  const [existing] = await db
    .select()
    .from(pantryItems)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.householdId, household.id)))
    .limit(1);
  if (!existing) throw new ApiError("That is not in your pantry", 404);

  // No unit given means the quantity is already in the unit the row is stored in, which
  // is what the list shows and what the old quantity-only callers meant.
  const converted =
    patch.quantity != null
      ? patch.unit
        ? toBaseUnit(patch.quantity, patch.unit)
        : { qty: patch.quantity, base: existing.unit ?? "piece" }
      : null;

  const quantity = patch.quantity === undefined ? Number(existing.quantity ?? 0) : (converted?.qty ?? null);
  if (quantity === null || quantity <= 0) {
    await db.delete(pantryItems).where(and(eq(pantryItems.id, id), eq(pantryItems.householdId, household.id)));
    return json({ item: null });
  }

  const name = patch.name ?? existing.name;
  const canonicalName = canonicalIngredient(name);
  if (!canonicalName) throw new ApiError("Give it a name we can recognise", 422);

  const unit = converted?.base ?? existing.unit ?? "piece";
  const category = patch.category ?? existing.category;

  // Renaming onto a shelf that already exists adds to it rather than failing.
  const [collision] = await db
    .select()
    .from(pantryItems)
    .where(
      and(
        eq(pantryItems.householdId, household.id),
        eq(pantryItems.canonicalName, canonicalName),
        eq(pantryItems.unit, unit),
        ne(pantryItems.id, id),
      ),
    )
    .limit(1);

  if (collision) {
    const [merged] = await db
      .update(pantryItems)
      .set({ quantity: String(Number(collision.quantity ?? 0) + quantity), name, category, updatedAt: new Date() })
      .where(eq(pantryItems.id, collision.id))
      .returning();
    await db.delete(pantryItems).where(eq(pantryItems.id, id));
    return json({ item: { ...merged, quantity: Number(merged.quantity) }, mergedInto: merged.id });
  }

  const [item] = await db
    .update(pantryItems)
    .set({ name, canonicalName, quantity: String(quantity), unit, category, updatedAt: new Date() })
    .where(and(eq(pantryItems.id, id), eq(pantryItems.householdId, household.id)))
    .returning();

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
