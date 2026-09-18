import { KITCHEN_CONTEXT, UNITS, CATEGORIES, COURSES } from "./kitchen-context";
import { strictObject, arrayOf, str, bool, int, nullable, enumOf } from "./strict";
import type { Nutrition } from "@/lib/db/schema";

/* --------------------------------- schema --------------------------------- */

/**
 * Every nutrient is required but nullable: a model that genuinely cannot estimate
 * vitamin D should say null rather than inventing a number, and strict mode does not
 * allow simply leaving a field out.
 */
const NUTRIENT_KEYS = [
  "calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
  "iron_mg", "calcium_mg", "zinc_mg", "magnesium_mg", "potassium_mg", "sodium_mg",
  "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_b12_mcg", "folate_mcg",
] as const;

export const SCHEMA = strictObject({
  normalized_name: str("The dish name cleaned up and properly capitalised, e.g. 'rajma chawal' -> 'Rajma Chawal'."),
  description: str("One short line describing the dish. Max 120 characters."),
  course: enumOf(COURSES, "When this is usually eaten."),
  is_veg: bool("False if it contains meat, fish or eggs."),
  prep_minutes: int("Realistic total cooking time in minutes."),
  tags: arrayOf(str(), "2-4 short lowercase tags, e.g. 'north indian', 'high protein', 'one pot'."),
  ingredients: arrayOf(
    strictObject({
      name: str("Common Indian name, e.g. 'Rajma (kidney beans)', 'Jeera', 'Dahi'."),
      quantity: nullable("number", "Null only for things measured 'to taste'."),
      unit: enumOf(UNITS),
      category: enumOf(CATEGORIES),
      optional: bool("True if the dish works fine without it."),
      is_pantry_staple: bool("True for salt, haldi, oil, common masalas — things already in the kitchen."),
    }),
    "Everything needed, scaled to the requested servings. Include spices and staples too.",
  ),
  nutrition_per_serving: strictObject(
    Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, nullable("number")])),
    "Best estimate per single serving. Use null only where you genuinely cannot estimate.",
  ),
});

/* --------------------------------- prompts -------------------------------- */

export function system() {
  return `${KITCHEN_CONTEXT}

You are filling in the ingredient list and nutrition for one dish. Be practical and specific, never vague.`;
}

export function user(input: { name: string; hint?: string | null; servings: number }) {
  const lines = [`Dish: "${input.name}"`];

  if (input.hint) {
    lines.push(`Extra detail from the person who added it: "${input.hint}"`);
  }

  lines.push(
    ``,
    `Scale the ingredient quantities for ${input.servings} servings.`,
    `Give the nutrition per ONE serving, not for all ${input.servings}.`,
    ``,
    `If the name is vague (e.g. "dal", "sabzi"), assume the most common everyday version`,
    `and say which one you assumed in the description.`,
  );

  return lines.join("\n");
}

/* ---------------------------------- types --------------------------------- */

export type AiIngredient = {
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  optional?: boolean;
  is_pantry_staple?: boolean;
};

export type DishDetails = {
  normalized_name: string;
  description: string;
  course: "breakfast" | "lunch" | "dinner" | "snack" | "any";
  is_veg: boolean;
  prep_minutes: number;
  tags: string[];
  ingredients: AiIngredient[];
  nutrition_per_serving: Nutrition;
};
