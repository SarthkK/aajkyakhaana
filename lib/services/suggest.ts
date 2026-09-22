import "server-only";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { dishes, planEntries, suggestionLog } from "@/lib/db/schema";
import { suggestMealsFor, type Suggestion } from "@/lib/ai/suggest";
import { summarizeDay } from "@/lib/summary";
import { todayIn, addDays, type Slot } from "@/lib/dates";
import { pseudonymise } from "@/lib/privacy";
import type { ActiveHousehold } from "@/lib/auth";

export type { Suggestion };

/**
 * How far back offers are remembered.
 *
 * Without this, only *planned* meals counted as history — so a suggestion nobody took
 * came straight back on the next ask, and the same two or three dishes circled
 * forever. Five days is long enough to break the loop and short enough that a genuine
 * favourite can come round again.
 */
const SUGGESTION_MEMORY_DAYS = 5;

/**
 * Works out what this flat should eat, and remembers having said it.
 *
 * Shared by the "Ask AI" button and the group-chat vote so both get the same answer
 * quality and, more importantly, the same memory — offering the same dish in the chat
 * that was just declined on the plan is exactly the repetition this guards against.
 */
export async function buildSuggestions(input: {
  household: ActiveHousehold;
  date: string;
  slot: Slot;
}): Promise<Suggestion[]> {
  const { household, date, slot } = input;
  const today = todayIn(household.timezone);

  const [library, recentRows, sameDay, alreadyOffered, summary] = await Promise.all([
    db
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
      .limit(60),

    // Two weeks back, so it does not suggest the rajma they ate on Tuesday.
    db
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
      .limit(40),

    db
      .select({ slot: planEntries.slot, name: dishes.name })
      .from(planEntries)
      .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
      .where(and(eq(planEntries.householdId, household.id), eq(planEntries.date, date))),

    db
      .select({ name: suggestionLog.name })
      .from(suggestionLog)
      .where(
        and(
          eq(suggestionLog.householdId, household.id),
          gte(suggestionLog.createdAt, new Date(Date.now() - SUGGESTION_MEMORY_DAYS * 86400000)),
        ),
      )
      .orderBy(desc(suggestionLog.createdAt))
      .limit(30),

    summarizeDay(household.id, date),
  ]);

  const libraryIds = new Set(library.map((d) => d.id));

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
    // Pseudonymised like every other prompt — see lib/privacy.ts. Nothing is restored
    // here because suggestions never mention a person by name.
    members: pseudonymise(
      summary.members.map((m) => ({
        name: m.name,
        diet: m.diet,
        goal: m.goal,
        allergies: m.allergies,
        dislikes: m.dislikes,
      })),
    ).members,
    gaps: summary.gaps.slice(0, 5).map((g) => ({ nutrient: g.label, pctOfTarget: g.pctOfTarget })),
    recentlySuggested: [...new Set(alreadyOffered.map((r) => r.name))],
  });

  if (suggestions.length) {
    await db
      .insert(suggestionLog)
      .values(suggestions.map((s) => ({ householdId: household.id, name: s.name, slot })));
  }

  // Only trust library ids that really belong to this flat.
  return suggestions.map((s) => ({
    ...s,
    existing_dish_id: s.existing_dish_id && libraryIds.has(s.existing_dish_id) ? s.existing_dish_id : null,
  }));
}
