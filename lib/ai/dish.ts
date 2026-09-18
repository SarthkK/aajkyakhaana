import "server-only";
import { askForObject } from "./client";
import { dishDetails, UNITS, CATEGORIES } from "./prompts";
import { logger } from "@/lib/logger";

export type { AiIngredient, DishDetails as AiDishDetails } from "./prompts/dish-details";

const log = logger("ai.dish");

/** Look up what a dish needs and what it contains. Called when a dish enters the library. */
export async function fetchDishDetails(input: {
  name: string;
  hint?: string | null;
  servings: number;
}) {
  return log.time(
    "fetched dish details",
    () =>
      askForObject<dishDetails.DishDetails>({
        name: "save_dish_details",
        description: "Record the ingredient list and per-serving nutrition for an Indian home-cooked dish.",
        schema: dishDetails.SCHEMA,
        system: dishDetails.system(),
        prompt: dishDetails.user(input),
        maxTokens: 3000,
      }),
    { dish: input.name, servings: input.servings },
  );
}

/* ------------------------------ normalisation ------------------------------ */

const UNIT_SET = new Set<string>(UNITS);
const CATEGORY_SET = new Set<string>(CATEGORIES);

/**
 * Models wander outside the enum — "2 medium onions", "3 whole chillies", "1 clove".
 * Mapping those to the nearest real unit beats silently calling them grams.
 */
const UNIT_ALIASES: Record<string, string> = {
  medium: "piece", small: "piece", large: "piece", whole: "piece", clove: "piece", cloves: "piece",
  nos: "piece", no: "piece", pc: "piece", pcs: "piece", pieces: "piece",
  slice: "piece", slices: "piece", stick: "piece", sticks: "piece", dozen: "piece",
  gram: "g", grams: "g", gm: "g", gms: "g", kilogram: "kg", kilograms: "kg",
  millilitre: "ml", milliliter: "ml", litre: "l", liter: "l", litres: "l", liters: "l",
  teaspoon: "tsp", teaspoons: "tsp", tablespoon: "tbsp", tablespoons: "tbsp",
  cups: "cup", katori: "cup", bowl: "cup", handful: "bunch", bunches: "bunch",
  sprig: "bunch", sprigs: "bunch", pinches: "pinch", taste: "to taste",
};

export function normalizeUnit(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (UNIT_SET.has(value)) return value;
  return UNIT_ALIASES[value] ?? "piece";
}

export function normalizeCategory(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  return CATEGORY_SET.has(value) ? value : "other";
}

/**
 * Whether the model bothers to set is_pantry_staple varies by model, so we also
 * recognise the things every Indian kitchen already has. Without this, salt and
 * haldi end up on the weekly shopping list.
 */
const PANTRY_STAPLES = [
  "salt", "namak", "sugar", "cheeni", "haldi", "turmeric", "red chilli powder", "lal mirch",
  "chilli powder", "dhania powder", "coriander powder", "jeera", "cumin", "garam masala",
  "mustard seed", "sarson", "rai", "hing", "asafoetida", "black pepper", "kali mirch",
  "bay leaf", "tej patta", "cinnamon", "dalchini", "cardamom", "elaichi", "clove", "laung",
  "amchur", "dry mango powder", "kasuri methi", "ajwain", "carom", "methi seed", "fenugreek seed",
  "cooking oil", "vegetable oil", "refined oil", "sunflower oil", "mustard oil", "ghee",
  "chaat masala", "kitchen king", "baking soda", "baking powder", "star anise", "javitri",
];

/** Nobody buys water. Keeping it off the list entirely. */
const NEVER_SHOP = ["water", "paani", "ice"];

function looksLikeStaple(name: string) {
  const n = name.toLowerCase();
  if (NEVER_SHOP.some((w) => n === w || n.startsWith(`${w} `) || n.includes(`${w} for`))) return true;
  return PANTRY_STAPLES.some((staple) => n.includes(staple));
}

/** Marks the obvious staples the model missed, leaving its own decisions alone. */
export function applyPantryDefaults<T extends { name: string; isPantryStaple: boolean }>(rows: T[]): T[] {
  return rows.map((row) => (row.isPantryStaple ? row : { ...row, isPantryStaple: looksLikeStaple(row.name) }));
}
