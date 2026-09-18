import { KITCHEN_CONTEXT, UNITS, CATEGORIES, COURSES } from "./kitchen-context";
import type { Nutrition } from "@/lib/db/schema";

/* --------------------------------- schema --------------------------------- */

export const SCHEMA = {
  type: "object",
  properties: {
    normalized_name: {
      type: "string",
      description: "The dish name cleaned up and properly capitalised, e.g. 'rajma chawal' -> 'Rajma Chawal'.",
    },
    description: { type: "string", description: "One short line describing the dish. Max 120 characters." },
    course: { type: "string", enum: COURSES },
    is_veg: { type: "boolean", description: "False if it contains meat, fish or eggs." },
    prep_minutes: { type: "integer", description: "Realistic total cooking time in minutes." },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "2-4 short lowercase tags, e.g. 'north indian', 'high protein', 'one pot', 'comfort food'.",
    },
    ingredients: {
      type: "array",
      description: "Everything needed, scaled to the requested number of servings. Include spices and staples too.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Common Indian name, e.g. 'Rajma (kidney beans)', 'Jeera', 'Dahi'." },
          quantity: { type: ["number", "null"], description: "Null only for things measured 'to taste'." },
          unit: { type: "string", enum: UNITS },
          category: { type: "string", enum: CATEGORIES },
          optional: { type: "boolean" },
          is_pantry_staple: {
            type: "boolean",
            description: "True for salt, haldi, oil, common masalas — things already in the kitchen.",
          },
        },
        required: ["name", "unit", "category"],
      },
    },
    nutrition_per_serving: {
      type: "object",
      description: "Best estimate per single serving. Omit a field only if you truly cannot estimate it.",
      properties: Object.fromEntries(
        [
          "calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
          "iron_mg", "calcium_mg", "zinc_mg", "magnesium_mg", "potassium_mg", "sodium_mg",
          "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_b12_mcg", "folate_mcg",
        ].map((key) => [key, { type: "number" }]),
      ),
    },
  },
  required: [
    "normalized_name", "description", "course", "is_veg",
    "prep_minutes", "tags", "ingredients", "nutrition_per_serving",
  ],
} as const;

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
