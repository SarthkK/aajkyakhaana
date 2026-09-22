import "server-only";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { dishes, planEntries, votes } from "@/lib/db/schema";
import { askForObject } from "@/lib/ai/client";
import { planner } from "@/lib/ai/prompts";
import { summarizeDay } from "@/lib/summary";
import { todayIn, addDays, type Slot } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { pseudonymise, restoreNames } from "@/lib/privacy";
import type { ActiveHousehold } from "@/lib/auth";

const log = logger("planner");

export type AppliedPlan = {
  summary: string;
  added: { date: string; slot: string; dish: string; why: string | null }[];
  skipped: number;
  /** True when the model returned nothing at all, as opposed to every slot being taken. */
  modelReturnedNothing: boolean;
};

/**
 * Plans several days at once and puts them on the calendar.
 *
 * The single-slot suggester answers "what tonight?"; this answers "sort out our week",
 * which is a different problem — it has to balance across days, avoid repeating
 * itself, and reuse ingredients so one grocery run covers it.
 *
 * Slots that are already decided are left alone. Nobody wants a planner overwriting
 * the dinner they agreed on this morning.
 */
export async function planDays(input: {
  household: ActiveHousehold;
  userId: string;
  days: number;
  slots: Slot[];
  request: string | null;
}): Promise<AppliedPlan> {
  const { household, userId, days, slots, request } = input;
  const today = todayIn(household.timezone);
  const lastDay = addDays(today, days - 1);

  const [library, recentlyEaten, alreadyPlanned, summary] = await Promise.all([
    db.select({ name: dishes.name }).from(dishes).where(eq(dishes.householdId, household.id)).limit(40),

    db
      .select({ date: planEntries.date, slot: planEntries.slot, name: dishes.name })
      .from(planEntries)
      .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
      .where(
        and(
          eq(planEntries.householdId, household.id),
          gte(planEntries.date, addDays(today, -14)),
          lte(planEntries.date, addDays(today, -1)),
        ),
      )
      .orderBy(desc(planEntries.date))
      .limit(40),

    db
      .select({ date: planEntries.date, slot: planEntries.slot, name: dishes.name })
      .from(planEntries)
      .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
      .where(
        and(
          eq(planEntries.householdId, household.id),
          gte(planEntries.date, today),
          lte(planEntries.date, lastDay),
        ),
      ),

    summarizeDay(household.id, today),
  ]);

  // Nobody's real name leaves the server; swapped back into the summary below.
  const people = pseudonymise(
    summary.members.map((m) => ({
      name: m.name,
      diet: m.diet,
      goal: m.goal,
      allergies: m.allergies,
      dislikes: m.dislikes,
      calories: m.targets?.calories,
      protein: m.targets?.protein_g,
    })),
  );

  const plan = await askForObject<planner.DietPlan>({
    name: "diet_plan",
    description: "Plan several days of meals for this flat.",
    schema: planner.SCHEMA,
    system: planner.system(),
    prompt: planner.user({
      days,
      slots,
      today,
      members: people.members,
      library: library.map((d) => d.name),
      recentlyEaten,
      alreadyPlanned,
      request,
    }),
    maxTokens: 2500,
  });

  const modelReturnedNothing = !plan.meals?.length;
  if (modelReturnedNothing) {
    log.warn("planner returned no meals", { received: JSON.stringify(plan).slice(0, 400) });
  }

  const taken = new Set(alreadyPlanned.map((p) => `${p.date}|${p.slot}`));
  const added: AppliedPlan["added"] = [];
  let skipped = 0;

  for (const meal of plan.meals ?? []) {
    const offset = Number(meal.day_offset);
    if (!Number.isFinite(offset) || offset < 0 || offset >= days) {
      skipped++;
      continue;
    }

    const date = addDays(today, offset);
    if (taken.has(`${date}|${meal.slot}`)) {
      skipped++;
      continue;
    }

    // Reuse a saved dish of the same name rather than creating a duplicate.
    const [existing] = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(and(eq(dishes.householdId, household.id), eq(dishes.name, meal.dish)))
      .limit(1);

    const dishId =
      existing?.id ??
      (
        await db
          .insert(dishes)
          .values({
            householdId: household.id,
            name: meal.dish,
            course: meal.slot,
            createdBy: userId,
            enrichStatus: "pending",
          })
          .returning()
      )[0].id;

    const [entry] = await db
      .insert(planEntries)
      .values({ householdId: household.id, date, slot: meal.slot, dishId, addedBy: userId, suggested: true })
      .onConflictDoNothing()
      .returning();

    if (!entry) {
      skipped++;
      continue;
    }

    await db.insert(votes).values({ planEntryId: entry.id, userId, value: 1 }).onConflictDoNothing();
    taken.add(`${date}|${meal.slot}`);
    added.push({ date, slot: meal.slot, dish: meal.dish, why: meal.why });
  }

  log.info("planned days", { householdId: household.id, days, added: added.length, skipped });
  return {
    summary: restoreNames(plan.summary, people.restore),
    added,
    skipped,
    modelReturnedNothing,
  };
}
