import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pantryItems } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { canonicalIngredient } from "@/lib/ingredients";
import { addStock } from "@/lib/services/pantry";

const addSchema = z.object({
  name: z.string().trim().min(1, "What have you got?").max(120),
  quantity: z.coerce.number().min(0).max(100000).nullable().optional(),
  unit: z.string().trim().max(20).default("g"),
  category: z.string().trim().max(20).default("other"),
});

/** What the flat has at home. */
export const GET = handler(async () => {
  const { household } = await requireContext();

  const rows = await db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.householdId, household.id))
    .orderBy(asc(pantryItems.category), asc(pantryItems.name));

  return json({ items: rows.map((r) => ({ ...r, quantity: r.quantity ? Number(r.quantity) : null })) });
});

/** Adding by hand, for the things that were already in the cupboard. */
export const POST = handler(async (req: Request) => {
  const { household } = await requireContext();
  const input = addSchema.parse(await req.json());

  await addStock(household.id, [
    { name: input.name, quantity: input.quantity ?? null, unit: input.unit, category: input.category },
  ]);

  const [item] = await db
    .select()
    .from(pantryItems)
    .where(
      and(
        eq(pantryItems.householdId, household.id),
        eq(pantryItems.canonicalName, canonicalIngredient(input.name)),
      ),
    )
    .limit(1);

  if (!item) throw new ApiError("Give it a quantity so we know how much you have", 422);
  return json({ item: { ...item, quantity: item.quantity ? Number(item.quantity) : null } }, 201);
});
