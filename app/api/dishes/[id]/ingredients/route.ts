import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { dishes, dishIngredients } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Ingredient needs a name").max(120),
  quantity: z.coerce.number().min(0).max(100000).nullable().optional(),
  unit: z.enum(["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch", "bunch", "to taste"]).default("g"),
  category: z.enum(["produce", "dairy", "grains", "pulses", "spices", "meat", "other"]).default("other"),
  optional: z.boolean().default(false),
  isPantryStaple: z.boolean().default(false),
});

const schema = z.object({ ingredients: z.array(ingredientSchema).max(60) });

/** Full replace — the edit screen sends the whole list back after the user changes it. */
export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;

  const [dish] = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(and(eq(dishes.id, id), eq(dishes.householdId, household.id)))
    .limit(1);
  if (!dish) throw new ApiError("Dish not found", 404);

  const { ingredients } = schema.parse(await req.json());

  await db.transaction(async (tx) => {
    await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, id));
    if (ingredients.length) {
      await tx.insert(dishIngredients).values(
        ingredients.map((i, idx) => ({
          dishId: id,
          name: i.name,
          quantity: i.quantity != null ? String(i.quantity) : null,
          unit: i.unit,
          category: i.category,
          optional: i.optional,
          isPantryStaple: i.isPantryStaple,
          sortOrder: idx,
        })),
      );
    }
    // Hand-edited lists count as ready even if the AI lookup had failed.
    await tx.update(dishes).set({ enrichStatus: "ready", enrichError: null }).where(eq(dishes.id, id));
  });

  const rows = await db
    .select()
    .from(dishIngredients)
    .where(eq(dishIngredients.dishId, id))
    .orderBy(asc(dishIngredients.sortOrder));

  return json({ ingredients: rows });
});
