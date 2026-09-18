import { z } from "zod";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries, votes } from "@/lib/db/schema";
import { requireContext, handler, json } from "@/lib/api";
import { isValidDate, addDays, todayIn } from "@/lib/dates";
import { logger } from "@/lib/logger";

const log = logger("plan.repeat");

const schema = z.object({
  /** First day to copy from. Defaults to a week before `to`. */
  from: z.string().refine(isValidDate).optional(),
  /** First day to copy onto. Defaults to today. */
  onto: z.string().refine(isValidDate).optional(),
  days: z.coerce.number().int().min(1).max(14).default(7),
});

/**
 * Copies a stretch of the plan forward. Most flats settle into a rotation, so
 * rebuilding last week by hand is the exact tedium this app exists to remove.
 *
 * Days that already have something planned are left alone — this fills gaps, it does
 * not overwrite a decision someone already made.
 */
export const POST = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body ?? {});

  const onto = input.onto ?? todayIn(household.timezone);
  const from = input.from ?? addDays(onto, -input.days);
  const offset = input.days;

  const source = await db
    .select()
    .from(planEntries)
    .where(
      and(
        eq(planEntries.householdId, household.id),
        gte(planEntries.date, from),
        lte(planEntries.date, addDays(from, input.days - 1)),
        ne(planEntries.status, "cancelled"),
      ),
    );

  if (source.length === 0) {
    return json({ copied: 0, message: "There is nothing in that week to copy." });
  }

  // Never touch a day the flat has already decided on.
  const existing = await db
    .select({ date: planEntries.date, slot: planEntries.slot })
    .from(planEntries)
    .where(
      and(
        eq(planEntries.householdId, household.id),
        gte(planEntries.date, onto),
        lte(planEntries.date, addDays(onto, input.days - 1)),
      ),
    );
  const taken = new Set(existing.map((e) => `${e.date}|${e.slot}`));

  const rows = source
    .map((entry) => ({ ...entry, newDate: addDays(entry.date, offset) }))
    .filter((entry) => !taken.has(`${entry.newDate}|${entry.slot}`))
    .map((entry) => ({
      householdId: household.id,
      date: entry.newDate,
      slot: entry.slot,
      dishId: entry.dishId,
      servings: entry.servings,
      addedBy: userId,
      status: "proposed" as const,
    }));

  if (rows.length === 0) {
    return json({ copied: 0, message: "Those days are already planned." });
  }

  const created = await db.insert(planEntries).values(rows).onConflictDoNothing().returning({ id: planEntries.id });

  // Whoever copied it is assumed to be fine with all of it.
  if (created.length) {
    await db
      .insert(votes)
      .values(created.map((entry) => ({ planEntryId: entry.id, userId, value: 1 })))
      .onConflictDoNothing();
  }

  log.info("copied a week forward", { householdId: household.id, from, onto, copied: created.length });
  return json({ copied: created.length, from, onto });
});
