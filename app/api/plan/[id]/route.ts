import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { planEntries } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { isValidDate, friendlyDate, todayIn, SLOT_LABELS, type Slot } from "@/lib/dates";
import { recordEvent } from "@/lib/services/chat";
import { removeStock } from "@/lib/services/pantry";
import { dishIngredients } from "@/lib/db/schema";
import { dishes } from "@/lib/db/schema";
import { eq as eqOp } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  date: z.string().refine(isValidDate).optional(),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  servings: z.coerce.number().int().min(1).max(30).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  status: z.enum(["proposed", "confirmed", "cooked", "cancelled"]).optional(),
});

async function loadEntry(id: string, householdId: string) {
  const [entry] = await db
    .select()
    .from(planEntries)
    .where(and(eq(planEntries.id, id), eq(planEntries.householdId, householdId)))
    .limit(1);
  if (!entry) throw new ApiError("That meal is not on the plan any more", 404);
  return entry;
}

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { household } = await requireContext();
  const { id } = await ctx.params;
  const existing = await loadEntry(id, household.id);

  const patch = patchSchema.parse(await req.json());
  if (Object.keys(patch).length === 0) throw new ApiError("Nothing to update");

  const [entry] = await db.update(planEntries).set(patch).where(eq(planEntries.id, id)).returning();

  // Marking a meal cooked takes its ingredients out of the kitchen, which is what
  // keeps the pantry honest without anyone maintaining it by hand.
  if (patch.status === "cooked" && existing.status !== "cooked") {
    const used = await db
      .select()
      .from(dishIngredients)
      .where(eqOp(dishIngredients.dishId, entry.dishId));

    const base = existing.servings ?? null;
    await removeStock(
      household.id,
      used
        .filter((i) => !i.isPantryStaple && i.quantity != null)
        .map((i) => ({
          name: i.name,
          // Scaled to however many the meal was actually for.
          quantity: Number(i.quantity) * (base ? base / 4 : 1),
          unit: i.unit,
        })),
    );
  }

  return json({ entry });
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { userId, household } = await requireContext();
  const { id } = await ctx.params;
  const entry = await loadEntry(id, household.id);

  const [dish] = await db
    .select({ name: dishes.name })
    .from(dishes)
    .where(eqOp(dishes.id, entry.dishId))
    .limit(1);

  await db.delete(planEntries).where(eq(planEntries.id, id));

  const when = friendlyDate(entry.date, todayIn(household.timezone)).toLowerCase();
  recordEvent({
    householdId: household.id,
    userId,
    kind: "meal_removed",
    body: `took ${dish?.name ?? "a dish"} off ${when}'s ${SLOT_LABELS[entry.slot as Slot].toLowerCase()}`,
    meta: { dishName: dish?.name, slot: entry.slot, date: entry.date },
  });

  return json({ ok: true });
});
