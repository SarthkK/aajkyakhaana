import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { dishes, dishIngredients } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { aiEnabled, missingKeyName, AiError } from "@/lib/ai/client";
import { fetchDishDetails, normalizeUnit, normalizeCategory, applyPantryDefaults } from "@/lib/ai/dish";

type Ctx = { params: Promise<{ id: string }> };

/** Strict mode makes the model send every nutrient, using null where it cannot say.
 *  Those nulls must be dropped, not stored as zeros, or the day's totals go wrong. */
function cleanNutrition(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return null;
  const kept = Object.entries(raw).filter(
    ([, value]) => typeof value === "number" && Number.isFinite(value),
  );
  return kept.length ? (Object.fromEntries(kept) as typeof raw) : null;
}

// The model call can take a while; give it room on serverless hosts.
export const maxDuration = 60;

/**
 * Looks up ingredients + nutrition for a dish and replaces whatever was there.
 * Safe to call again if the first attempt failed or the name was corrected.
 */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;

  const [dish] = await db
    .select()
    .from(dishes)
    .where(and(eq(dishes.id, id), eq(dishes.householdId, household.id)))
    .limit(1);
  if (!dish) throw new ApiError("Dish not found", 404);

  if (!aiEnabled()) {
    await db.update(dishes)
      .set({ enrichStatus: "failed", enrichError: "AI is not configured on this server." })
      .where(eq(dishes.id, id));
    throw new ApiError(`AI is not configured. Add ${missingKeyName()}, or add ingredients by hand.`, 503);
  }

  try {
    const details = await fetchDishDetails({
      name: dish.name,
      hint: dish.description,
      servings: dish.baseServings,
    });

    const rows = applyPantryDefaults(
      (details.ingredients ?? [])
      .filter((i) => i?.name)
      .map((i, idx) => ({
        dishId: dish.id,
        name: String(i.name).slice(0, 120),
        quantity: i.quantity != null && Number.isFinite(i.quantity) ? String(i.quantity) : null,
        unit: normalizeUnit(i.unit),
        category: normalizeCategory(i.category),
        optional: Boolean(i.optional),
        isPantryStaple: Boolean(i.is_pantry_staple),
        sortOrder: idx,
      })),
    );

    // Replace atomically so a half-written list can never be shown.
    const [updated] = await db.transaction(async (tx) => {
      await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, dish.id));
      if (rows.length) await tx.insert(dishIngredients).values(rows);
      return tx
        .update(dishes)
        .set({
          name: details.normalized_name?.trim() || dish.name,
          description: details.description?.slice(0, 300) ?? dish.description,
          course: dish.course === "any" ? (details.course ?? "any") : dish.course,
          isVeg: details.is_veg ?? dish.isVeg,
          prepMinutes: Number.isFinite(details.prep_minutes) ? details.prep_minutes : null,
          tags: (details.tags ?? []).slice(0, 6),
          nutrition: cleanNutrition(details.nutrition_per_serving),
          enrichStatus: "ready",
          enrichError: null,
        })
        .where(eq(dishes.id, dish.id))
        .returning();
    });

    const ingredients = await db.select().from(dishIngredients).where(eq(dishIngredients.dishId, dish.id));
    return json({ dish: { ...updated, ingredients } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    await db.update(dishes).set({ enrichStatus: "failed", enrichError: message.slice(0, 300) }).where(eq(dishes.id, id));
    // AiError messages are already written for the person reading them.
    throw new ApiError(err instanceof AiError ? message : `Could not fetch ingredients: ${message}`, 502);
  }
});
