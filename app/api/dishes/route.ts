import { z } from "zod";
import { eq, desc, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { dishes, dishIngredients } from "@/lib/db/schema";
import { requireContext, handler, json } from "@/lib/api";

const createSchema = z.object({
  name: z.string().trim().min(1, "What is the dish called?").max(80),
  hint: z.string().trim().max(300).optional().nullable(),
  course: z.enum(["breakfast", "lunch", "dinner", "snack", "any"]).default("any"),
  baseServings: z.coerce.number().int().min(1).max(30).default(4),
});

/** The flat's whole dish library, with ingredients, newest first. */
export const GET = handler(async () => {
  const { household } = await requireContext();

  const rows = await db
    .select()
    .from(dishes)
    .where(eq(dishes.householdId, household.id))
    .orderBy(desc(dishes.createdAt));

  const ingredients = rows.length
    ? await db
        .select()
        .from(dishIngredients)
        .orderBy(asc(dishIngredients.sortOrder))
    : [];

  const byDish = new Map<string, typeof ingredients>();
  for (const ing of ingredients) {
    if (!byDish.has(ing.dishId)) byDish.set(ing.dishId, []);
    byDish.get(ing.dishId)!.push(ing);
  }

  return json({
    dishes: rows.map((d) => ({ ...d, ingredients: byDish.get(d.id) ?? [] })),
  });
});

/**
 * Creates the dish straight away with enrichStatus "pending". The client then calls
 * /enrich so a slow AI lookup never blocks the dish appearing in the list.
 */
export const POST = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const input = createSchema.parse(await req.json());

  const [dish] = await db
    .insert(dishes)
    .values({
      householdId: household.id,
      name: input.name,
      description: input.hint ?? null,
      course: input.course,
      baseServings: input.baseServings,
      createdBy: userId,
      enrichStatus: "pending",
    })
    .returning();

  return json({ dish: { ...dish, ingredients: [] } }, 201);
});
