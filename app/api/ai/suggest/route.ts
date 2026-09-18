import { z } from "zod";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries, dishes } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { aiEnabled, missingKeyName } from "@/lib/ai/client";
import { suggestMealsFor, type Suggestion } from "@/lib/ai/suggest";
import { summarizeDay } from "@/lib/summary";
import { isValidDate, todayIn, addDays } from "@/lib/dates";

export const maxDuration = 60;

const schema = z.object({
  date: z.string().refine(isValidDate, "Pick a valid date"),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
});

/** "Nobody has added anything — what should we eat?" */
export const POST = handler(async (req: Request) => {
  const { household } = await requireContext();
  if (!aiEnabled()) throw new ApiError(`AI is not configured. Add ${missingKeyName()} on the server.`, 503);

  const { date, slot } = schema.parse(await req.json());
  const today = todayIn(household.timezone);

  const library = await db
    .select({
      id: dishes.id,
      name: dishes.name,
      course: dishes.course,
      isVeg: dishes.isVeg,
      nutrition: dishes.nutrition,
    })
    .from(dishes)
    .where(eq(dishes.householdId, household.id))
    .orderBy(desc(dishes.createdAt))
    .limit(60);

  // Two weeks back, so it does not suggest the rajma they ate on Tuesday.
  const recentRows = await db
    .select({ date: planEntries.date, slot: planEntries.slot, name: dishes.name })
    .from(planEntries)
    .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
    .where(
      and(
        eq(planEntries.householdId, household.id),
        gte(planEntries.date, addDays(today, -14)),
        lt(planEntries.date, date),
      ),
    )
    .orderBy(desc(planEntries.date))
    .limit(40);

  const sameDay = await db
    .select({ slot: planEntries.slot, name: dishes.name })
    .from(planEntries)
    .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
    .where(and(eq(planEntries.householdId, household.id), eq(planEntries.date, date)));

  const summary = await summarizeDay(household.id, date);

  const suggestions = await suggestMealsFor({
    slot,
    date,
    library: library.map((d) => ({
      id: d.id,
      name: d.name,
      course: d.course,
      isVeg: d.isVeg,
      protein: d.nutrition?.protein_g,
      calories: d.nutrition?.calories,
    })),
    recent: recentRows,
    plannedToday: sameDay,
    // Names are stripped before leaving the server. Free model endpoints are allowed
    // to train on what they receive, and the model does not need to know who is who
    // to cook one meal for everyone.
    members: summary.members.map((m, i) => ({
      name: `Flatmate ${i + 1}`,
      diet: m.diet,
      goal: m.goal,
      allergies: m.allergies,
      dislikes: m.dislikes,
    })),
    gaps: summary.gaps.slice(0, 5).map((g) => ({ nutrient: g.label, pctOfTarget: g.pctOfTarget })),
  });

  // Only trust ids that really belong to this flat.
  const libraryIds = new Set(library.map((d) => d.id));
  return json({
    suggestions: suggestions.map((s: Suggestion) => ({
      ...s,
      existing_dish_id: s.existing_dish_id && libraryIds.has(s.existing_dish_id) ? s.existing_dish_id : null,
    })),
    gaps: summary.gaps.slice(0, 5),
  });
});
