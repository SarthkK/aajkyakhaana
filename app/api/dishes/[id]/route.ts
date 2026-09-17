import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { dishes, dishIngredients } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  course: z.enum(["breakfast", "lunch", "dinner", "snack", "any"]).optional(),
  isVeg: z.boolean().optional(),
  baseServings: z.coerce.number().int().min(1).max(30).optional(),
  prepMinutes: z.coerce.number().int().min(0).max(600).nullable().optional(),
  tags: z.array(z.string().trim().max(30)).max(8).optional(),
  nutrition: z.record(z.string(), z.number()).nullable().optional(),
});

async function loadDish(id: string, householdId: string) {
  const [dish] = await db
    .select()
    .from(dishes)
    .where(and(eq(dishes.id, id), eq(dishes.householdId, householdId)))
    .limit(1);
  if (!dish) throw new ApiError("Dish not found", 404);
  return dish;
}

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  const dish = await loadDish(id, household.id);
  const ingredients = await db
    .select()
    .from(dishIngredients)
    .where(eq(dishIngredients.dishId, dish.id))
    .orderBy(asc(dishIngredients.sortOrder));
  return json({ dish: { ...dish, ingredients } });
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  await loadDish(id, household.id);

  const patch = patchSchema.parse(await req.json());
  if (Object.keys(patch).length === 0) throw new ApiError("Nothing to update");

  const [dish] = await db.update(dishes).set(patch).where(eq(dishes.id, id)).returning();
  return json({ dish });
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  await loadDish(id, household.id);
  await db.delete(dishes).where(eq(dishes.id, id));
  return json({ ok: true });
});
