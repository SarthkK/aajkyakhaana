import { z } from "zod";
import { eq, and, gte, lte, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries, dishes, dishIngredients, shoppingItems } from "@/lib/db/schema";
import { requireContext, handler, json } from "@/lib/api";
import { isValidDate, todayIn, addDays } from "@/lib/dates";
import { mergeItems, normalizeName } from "@/lib/shopping";
import { currentStock, deductStock } from "@/lib/services/pantry";
import { isSlotLocked, type Slot } from "@/lib/slots";

const schema = z.object({
  from: z.string().refine(isValidDate).optional(),
  to: z.string().refine(isValidDate).optional(),
  /** Off by default — nobody wants haldi on the list every week. */
  includeStaples: z.boolean().default(false),
});

/**
 * Turns everything planned in a date range into shopping list lines, merging
 * repeated ingredients and skipping anything already on the list unticked.
 */
export const POST = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body ?? {});

  const today = todayIn(household.timezone);
  const from = input.from ?? today;
  const to = input.to ?? addDays(from, 6);

  const planned = await db
    .select({
      entryId: planEntries.id,
      date: planEntries.date,
      slot: planEntries.slot,
      servings: planEntries.servings,
      dishId: dishes.id,
      dishName: dishes.name,
      baseServings: dishes.baseServings,
    })
    .from(planEntries)
    .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
    .where(
      and(
        eq(planEntries.householdId, household.id),
        gte(planEntries.date, from),
        lte(planEntries.date, to),
        ne(planEntries.status, "cancelled"),
      ),
    );

  if (planned.length === 0) {
    return json({ added: 0, skipped: 0, message: "Nothing is planned in that range yet." });
  }

  // A meal past its lock time is being cooked, or has been. Shopping for it is asking
  // someone to buy ingredients for dinner they already ate.
  const shoppable = planned.filter((entry) => !isSlotLocked(entry.date, entry.slot as Slot, household));

  if (shoppable.length === 0) {
    return json({
      added: 0,
      skipped: 0,
      alreadyHave: [],
      settledMeals: planned.length,
      message: "Everything planned in that range is already settled — nothing left to buy for.",
    });
  }

  const dishIds = [...new Set(shoppable.map((p) => p.dishId))];
  const ingredients = await db.select().from(dishIngredients).where(inArray(dishIngredients.dishId, dishIds));

  const byDish = new Map<string, typeof ingredients>();
  for (const ing of ingredients) {
    if (!byDish.has(ing.dishId)) byDish.set(ing.dishId, []);
    byDish.get(ing.dishId)!.push(ing);
  }

  const raw = [];
  for (const entry of shoppable) {
    const list = byDish.get(entry.dishId) ?? [];
    const base = entry.baseServings || 4;
    const scale = (entry.servings ?? base) / base;

    for (const ing of list) {
      if (ing.optional) continue;
      if (ing.isPantryStaple && !input.includeStaples) continue;
      raw.push({
        name: ing.name,
        quantity: ing.quantity != null ? Number(ing.quantity) * scale : null,
        unit: ing.unit,
        category: ing.category,
      });
    }
  }

  const merged = mergeItems(raw);

  // Subtract what is already in the kitchen, so the list asks for what is missing
  // rather than everything the recipes mention.
  const stock = await currentStock(household.id);
  const { shopping: stillNeeded, alreadyHave } = deductStock(merged, stock);

  // Do not duplicate what is already waiting to be bought.
  const existing = await db
    .select({ name: shoppingItems.name, unit: shoppingItems.unit })
    .from(shoppingItems)
    .where(and(eq(shoppingItems.householdId, household.id), eq(shoppingItems.checked, false)));
  const existingKeys = new Set(existing.map((e) => `${normalizeName(e.name)}|${e.unit ?? ""}`));

  const toInsert = stillNeeded
    .filter((m) => !existingKeys.has(`${normalizeName(m.name)}|${m.unit ?? ""}`))
    .map((m) => ({
      householdId: household.id,
      name: m.name,
      quantity: m.quantity != null ? String(m.quantity) : null,
      unit: m.unit,
      category: m.category,
      note: m.note,
      source: "plan" as const,
      fromDate: from,
      addedBy: userId,
    }));

  if (toInsert.length) await db.insert(shoppingItems).values(toInsert);

  const dishNames = [...new Set(shoppable.map((p) => p.dishName))];
  const settled = planned.length - shoppable.length;

  return json({
    added: toInsert.length,
    skipped: stillNeeded.length - toInsert.length,
    alreadyHave,
    settledMeals: settled,
    dishes: dishNames,
    missingIngredients: dishIds.filter((id) => !byDish.has(id)).length,
  });
});
