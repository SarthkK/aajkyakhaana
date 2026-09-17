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

export function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ").replace(/\(.*?\)/g, "").trim();
}

/** Combines the same ingredient across every planned dish into one line each. */
export function mergeItems(items: RawItem[]): (RawItem & { key: string })[] {
  const merged = new Map<string, { name: string; qty: number | null; base: string; category: string; key: string }>();

  for (const item of items) {
    const norm = normalizeName(item.name);
    if (!norm) continue;

    if (item.quantity == null) {
      // "To taste" style entries: keep one line, no quantity.
      const key = `${norm}|~`;
      if (!merged.has(key)) merged.set(key, { name: item.name.trim(), qty: null, base: item.unit, category: item.category, key });
      continue;
    }

    const { qty, base } = toBase(item.quantity, item.unit);
    const key = `${norm}|${base}`;
    const existing = merged.get(key);
    if (existing && existing.qty != null) {
      existing.qty += qty;
    } else {
      merged.set(key, { name: item.name.trim(), qty, base, category: item.category, key });
    }
  }

  return [...merged.values()].map((m) => {
    if (m.qty == null) return { name: m.name, quantity: null, unit: m.base, category: m.category, key: m.key };
    const { quantity, unit } = fromBase(m.qty, m.base);
    return { name: m.name, quantity, unit, category: m.category, key: m.key };
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
