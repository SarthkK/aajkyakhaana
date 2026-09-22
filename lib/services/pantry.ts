import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pantryItems } from "@/lib/db/schema";
import { canonicalIngredient } from "@/lib/ingredients";
import { logger } from "@/lib/logger";

const log = logger("pantry");

/** Everything is stored in a base unit so stock and recipes can be compared. */
export function toBaseUnit(quantity: number, unit: string): { qty: number; base: string } {
  switch (unit) {
    case "kg": return { qty: quantity * 1000, base: "g" };
    case "g": return { qty: quantity, base: "g" };
    case "l": return { qty: quantity * 1000, base: "ml" };
    case "ml": return { qty: quantity, base: "ml" };
    case "tbsp": return { qty: quantity * 3, base: "tsp" };
    case "tsp": return { qty: quantity, base: "tsp" };
    default: return { qty: quantity, base: unit || "piece" };
  }
}

export type StockChange = {
  name: string;
  quantity: number | null;
  unit: string;
  category?: string;
};

/**
 * Adds to what the flat has. Used when shopping is ticked off.
 *
 * Items with no quantity ("to taste") are skipped: recording that you own an unknown
 * amount of salt helps nobody, and the staples list already keeps those off the list.
 */
export async function addStock(householdId: string, changes: StockChange[]): Promise<void> {
  const rows = changes
    .filter((c) => c.quantity != null && Number.isFinite(c.quantity) && c.quantity > 0)
    .map((c) => {
      const { qty, base } = toBaseUnit(c.quantity!, c.unit);
      return {
        householdId,
        name: c.name.trim(),
        canonicalName: canonicalIngredient(c.name),
        quantity: String(qty),
        unit: base,
        category: c.category ?? "other",
        source: "bought" as const,
      };
    })
    .filter((r) => r.canonicalName);

  if (rows.length === 0) return;

  for (const row of rows) {
    await db
      .insert(pantryItems)
      .values(row)
      // Buying more of something you already have adds to it.
      .onConflictDoUpdate({
        target: [pantryItems.householdId, pantryItems.canonicalName, pantryItems.unit],
        set: {
          quantity: sql`${pantryItems.quantity} + ${row.quantity}`,
          updatedAt: new Date(),
        },
      });
  }

  log.info("stock added", { householdId, items: rows.length });
}

/** Takes stock away, and removes the row once it reaches zero. */
export async function removeStock(householdId: string, changes: StockChange[]): Promise<void> {
  for (const change of changes) {
    if (change.quantity == null || !Number.isFinite(change.quantity)) continue;
    const canonical = canonicalIngredient(change.name);
    if (!canonical) continue;

    const { qty, base } = toBaseUnit(change.quantity, change.unit);

    await db
      .update(pantryItems)
      .set({ quantity: sql`greatest(0, ${pantryItems.quantity} - ${String(qty)})`, updatedAt: new Date() })
      .where(
        and(
          eq(pantryItems.householdId, householdId),
          eq(pantryItems.canonicalName, canonical),
          eq(pantryItems.unit, base),
        ),
      );
  }

  // An empty shelf is not stock.
  await db
    .delete(pantryItems)
    .where(and(eq(pantryItems.householdId, householdId), eq(pantryItems.quantity, "0")));
}

export type Stock = Map<string, { quantity: number; unit: string; name: string }>;

/** What the flat has, keyed by canonical name and base unit. */
export async function currentStock(householdId: string): Promise<Stock> {
  const rows = await db.select().from(pantryItems).where(eq(pantryItems.householdId, householdId));
  const stock: Stock = new Map();
  for (const row of rows) {
    stock.set(`${row.canonicalName}|${row.unit ?? ""}`, {
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "",
      name: row.name,
    });
  }
  return stock;
}

/**
 * Subtracts what is already at home from what a plan needs.
 *
 * Anything fully covered drops off the list entirely; anything partly covered asks
 * only for the shortfall — 300g of rajma needed with 200g in the cupboard becomes
 * "100 g", not "300 g".
 */
export function deductStock(
  needed: { name: string; quantity: number | null; unit: string; category: string; note: string | null; key: string }[],
  stock: Stock,
): { shopping: typeof needed; alreadyHave: string[] } {
  const shopping: typeof needed = [];
  const alreadyHave: string[] = [];

  for (const item of needed) {
    if (item.quantity == null) {
      shopping.push(item);
      continue;
    }

    const { qty, base } = toBaseUnit(item.quantity, item.unit);
    const have = stock.get(`${canonicalIngredient(item.name)}|${base}`);

    if (!have || have.quantity <= 0) {
      shopping.push(item);
      continue;
    }

    const short = qty - have.quantity;
    if (short <= 0) {
      alreadyHave.push(item.name);
      continue;
    }

    shopping.push({ ...item, ...fromBaseUnit(short, base) });
  }

  return { shopping, alreadyHave };
}

/** Back to something a person would write down. */
function fromBaseUnit(qty: number, base: string): { quantity: number; unit: string } {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (base === "g" && qty >= 1000) return { quantity: round(qty / 1000), unit: "kg" };
  if (base === "ml" && qty >= 1000) return { quantity: round(qty / 1000), unit: "l" };
  if (base === "tsp" && qty >= 3) return { quantity: round(qty / 3), unit: "tbsp" };
  return { quantity: round(qty), unit: base };
}
