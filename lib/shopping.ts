import { canonicalIngredient, preferredLabel } from "@/lib/ingredients";

export type RawItem = {
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
};

/** Normalise to a base unit so 500 g + 1 kg becomes 1.5 kg instead of two lines. */
function toBase(quantity: number, unit: string): { qty: number; base: string } {
  switch (unit) {
    case "kg": return { qty: quantity * 1000, base: "g" };
    case "g": return { qty: quantity, base: "g" };
    case "l": return { qty: quantity * 1000, base: "ml" };
    case "ml": return { qty: quantity, base: "ml" };
    case "tbsp": return { qty: quantity * 3, base: "tsp" };
    case "tsp": return { qty: quantity, base: "tsp" };
    default: return { qty: quantity, base: unit };
  }
}

/** Back to whatever a person would actually write on a shopping list. */
function fromBase(qty: number, base: string): { quantity: number; unit: string } {
  if (base === "g" && qty >= 1000) return { quantity: round(qty / 1000), unit: "kg" };
  if (base === "ml" && qty >= 1000) return { quantity: round(qty / 1000), unit: "l" };
  if (base === "tsp" && qty >= 3) return { quantity: round(qty / 3), unit: "tbsp" };
  return { quantity: round(qty), unit: base };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * The key two ingredients must share to be one line on the list.
 *
 * Delegates to lib/ingredients.ts, which knows that "chopped dhaniya" and "Coriander
 * leaves (for garnish)" are the same trip to the sabzi-wala, and that kasuri methi is
 * not.
 */
export function normalizeName(name: string) {
  return canonicalIngredient(name);
}

export type MergedItem = RawItem & { key: string; note: string | null };

/**
 * Combines the same ingredient across every planned dish into one line.
 *
 * Quantities in the same unit family add up (500 g + 1 kg = 1.5 kg). Where two dishes
 * ask for the same thing in genuinely different units — one recipe says "2 onions",
 * another says "200 g onion" — there is no honest conversion, so rather than print
 * Onion twice and make someone do the arithmetic in the shop, it becomes one row with
 * the remainder in the note: "200 g  (+ 2 piece)".
 */
export function mergeItems(items: RawItem[]): MergedItem[] {
  // canonical name -> base unit -> running total (null means "to taste", no quantity)
  const byName = new Map<
    string,
    { labels: string[]; category: string; units: Map<string, number | null> }
  >();

  for (const item of items) {
    const norm = normalizeName(item.name);
    if (!norm) continue;

    let entry = byName.get(norm);
    if (!entry) {
      entry = { labels: [], category: item.category, units: new Map() };
      byName.set(norm, entry);
    }
    // Every spelling seen, so the plainest one can be shown.
    entry.labels.push(item.name.trim());

    if (item.quantity == null) {
      if (!entry.units.has("~")) entry.units.set("~", null);
      continue;
    }

    const { qty, base } = toBase(item.quantity, item.unit);
    const running = entry.units.get(base);
    entry.units.set(base, (typeof running === "number" ? running : 0) + qty);
  }

  return [...byName.entries()].map(([norm, entry]) => {
    const parts = [...entry.units.entries()]
      .filter(([base]) => base !== "~")
      .map(([base, total]) => fromBase(total ?? 0, base));

    const label = preferredLabel(entry.labels);

    if (parts.length === 0) {
      return { name: label, quantity: null, unit: "", category: entry.category, key: norm, note: null };
    }

    const [main, ...extras] = parts;
    return {
      name: label,
      quantity: main.quantity,
      unit: main.unit,
      category: entry.category,
      key: norm,
      note: extras.length ? `+ ${extras.map((e) => `${e.quantity} ${e.unit}`).join(", ")}` : null,
    };
  });
}

export const CATEGORY_LABELS: Record<string, string> = {
  produce: "Sabzi & fruit",
  dairy: "Dairy & eggs",
  grains: "Atta, rice & grains",
  pulses: "Dals & pulses",
  spices: "Masala & oils",
  meat: "Meat & fish",
  other: "Everything else",
};

export const CATEGORY_ORDER = ["produce", "dairy", "pulses", "grains", "meat", "spices", "other"];
