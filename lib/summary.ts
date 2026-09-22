import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries, dishes, householdMembers, users, profiles, votes } from "@/lib/db/schema";
import { resolveSlot, SLOTS } from "@/lib/slots";
import {
  computeTargets, sumNutrition, pctOfTarget, MACRO_KEYS, MICRO_KEYS, NUTRIENT_LABELS,
  type Sex, type Targets,
} from "@/lib/nutrition";
import type { Nutrition } from "@/lib/db/schema";

export type MemberSummary = {
  userId: string;
  name: string;
  emoji: string;
  diet: string;
  goal: string;
  allergies: string[];
  dislikes: string[];
  targets: Targets | null;
  /** Percent of each target the day's plan covers for this person. */
  coverage: Record<string, number>;
};

export type DaySummary = {
  date: string;
  /** What one person eats if they have a serving of each meal the flat settles on. */
  perPerson: Nutrition;
  /** Meals counted — one per slot, not one per proposal. */
  dishCount: number;
  members: MemberSummary[];
  /** Nutrients the flat is collectively short on, worst first. */
  gaps: { nutrient: string; label: string; pctOfTarget: number }[];
};

/**
 * Nutrition for one day, assuming each person eats one serving of what the flat is
 * actually going to eat. That is deliberately simple — it is a planning signal, not a
 * food diary.
 *
 * **One dish per slot, not every dish proposed.** Proposing three dinners and voting for
 * one does not mean the flat eats three dinners, but this used to sum every entry that
 * was not explicitly cancelled — and nothing ever sets "cancelled" on its own, so losing
 * a vote left a dish in the totals forever. A flat that argues about its meals looked
 * like it was eating two or three times what it eats: 2500 kcal and 100% of protein off
 * a day with one real meal in it. The same numbers go to the chef, the planner and the
 * suggestion prompt, so the model was being told the flat was well fed when it was not.
 *
 * The winner is picked with resolveSlot — the same most-votes-then-first-proposed rule
 * the board and the cook's briefing already show, so the card agrees with the screen it
 * sits on. Before a slot locks the winner is simply the current front-runner.
 */
export async function summarizeDay(householdId: string, date: string): Promise<DaySummary> {
  const rows = await db
    .select({
      id: planEntries.id,
      slot: planEntries.slot,
      status: planEntries.status,
      createdAt: planEntries.createdAt,
      nutrition: dishes.nutrition,
    })
    .from(planEntries)
    .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
    .where(and(eq(planEntries.householdId, householdId), eq(planEntries.date, date)));

  const ids = rows.map((r) => r.id);
  const voteRows = ids.length
    ? await db.select({ planEntryId: votes.planEntryId, value: votes.value }).from(votes).where(inArray(votes.planEntryId, ids))
    : [];

  const votable = rows.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
    upVotes: voteRows.filter((v) => v.planEntryId === r.id && v.value > 0).length,
  }));

  const counted = SLOTS.map(
    (slot) => resolveSlot(votable.filter((e) => e.slot === slot), { locked: false }).winner,
  ).filter((w) => w !== null);

  const perPerson = sumNutrition(counted.map((r) => r.nutrition));

  const memberRows = await db
    .select({
      userId: users.id,
      name: users.name,
      emoji: users.emoji,
      sex: profiles.sex,
      age: profiles.age,
      heightCm: profiles.heightCm,
      weightKg: profiles.weightKg,
      activityLevel: profiles.activityLevel,
      goal: profiles.goal,
      diet: profiles.diet,
      allergies: profiles.allergies,
      dislikes: profiles.dislikes,
      calorieOverride: profiles.calorieOverride,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(householdMembers.householdId, householdId));

  const members: MemberSummary[] = memberRows.map((m) => {
    const targets = computeTargets({
      sex: (m.sex ?? null) as Sex | null,
      age: m.age,
      heightCm: m.heightCm ? Number(m.heightCm) : null,
      weightKg: m.weightKg ? Number(m.weightKg) : null,
      activityLevel: m.activityLevel ?? "light",
      goal: m.goal ?? "maintain",
      calorieOverride: m.calorieOverride,
    });

    const coverage: Record<string, number> = {};
    if (targets) {
      for (const key of [...MACRO_KEYS, ...MICRO_KEYS]) {
        coverage[key] = pctOfTarget(perPerson[key as keyof Nutrition] as number | undefined, targets[key]);
      }
    }

    return {
      userId: m.userId,
      name: m.name,
      emoji: m.emoji,
      diet: m.diet ?? "veg",
      goal: m.goal ?? "maintain",
      allergies: m.allergies ?? [],
      dislikes: m.dislikes ?? [],
      targets,
      coverage,
    };
  });

  // A nutrient nobody has data for is unknown, not a shortfall — otherwise every
  // micronutrient the AI did not estimate would look like a gap.
  const known = new Set<string>();
  for (const row of counted) {
    for (const [key, value] of Object.entries(row.nutrition ?? {})) {
      if (typeof value === "number" && Number.isFinite(value)) known.add(key);
    }
  }

  // Average coverage across everyone who has filled in their stats.
  const withTargets = members.filter((m) => m.targets);
  const gaps: DaySummary["gaps"] = [];
  if (withTargets.length && counted.length) {
    for (const key of [...MACRO_KEYS, ...MICRO_KEYS]) {
      if (key === "sodium_mg") continue; // an upper limit, not something to chase
      if (!known.has(key)) continue;
      const avg = Math.round(
        withTargets.reduce((sum, m) => sum + (m.coverage[key] ?? 0), 0) / withTargets.length,
      );
      if (avg < 85) gaps.push({ nutrient: key, label: NUTRIENT_LABELS[key] ?? key, pctOfTarget: avg });
    }
    gaps.sort((a, b) => a.pctOfTarget - b.pctOfTarget);
  }

  return { date, perPerson, dishCount: counted.length, members, gaps };
}
