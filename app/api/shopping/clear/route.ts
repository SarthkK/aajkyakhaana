import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { shoppingItems } from "@/lib/db/schema";
import { requireContext, handler, json } from "@/lib/api";

/** Clears everything already ticked off — used after a grocery run. */
export const POST = handler(async () => {
  const { household } = await requireContext();
  const removed = await db
    .delete(shoppingItems)
    .where(and(eq(shoppingItems.householdId, household.id), eq(shoppingItems.checked, true)))
    .returning({ id: shoppingItems.id });
  return json({ removed: removed.length });
});
