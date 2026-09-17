import "server-only";
import { askForObject, INDIAN_KITCHEN_CONTEXT } from "./client";
import type { Nutrition } from "@/lib/db/schema";

export type AiIngredient = {
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  optional?: boolean;
  is_pantry_staple?: boolean;
};

export type AiDishDetails = {
  normalized_name: string;
  description: string;
  course: "breakfast" | "lunch" | "dinner" | "snack" | "any";
  is_veg: boolean;
  prep_minutes: number;
  tags: string[];
  ingredients: AiIngredient[];
  nutrition_per_serving: Nutrition;
};

const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch", "bunch", "to taste"];
const CATEGORIES = ["produce", "dairy", "grains", "pulses", "spices", "meat", "other"];

const tool = {
  name: "save_dish_details",
  description: "Record the ingredient list and per-serving nutrition for an Indian home-cooked dish.",
  input_schema: {
    type: "object",
    properties: {
      normalized_name: {
        type: "string",
        description: "The dish name cleaned up and properly capitalised, e.g. 'rajma chawal' -> 'Rajma Chawal'.",
      },
      description: { type: "string", description: "One short line describing the dish. Max 120 characters." },
      course: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack", "any"] },
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
        properties: {
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          fiber_g: { type: "number" },
          iron_mg: { type: "number" },
          calcium_mg: { type: "number" },
          zinc_mg: { type: "number" },
          magnesium_mg: { type: "number" },
          potassium_mg: { type: "number" },
          sodium_mg: { type: "number" },
          vitamin_a_mcg: { type: "number" },
          vitamin_c_mg: { type: "number" },
          vitamin_d_mcg: { type: "number" },
          vitamin_b12_mcg: { type: "number" },
          folate_mcg: { type: "number" },
        },
      },
    },
    required: ["normalized_name", "description", "course", "is_veg", "prep_minutes", "tags", "ingredients", "nutrition_per_serving"],
  },
};

/** Look up what a dish needs and what it contains. Called when a dish is added to the library. */
export async function fetchDishDetails(input: {
  name: string;
  hint?: string | null;
  servings: number;
}): Promise<AiDishDetails> {
  const prompt = `Dish: "${input.name}"
${input.hint ? `Extra detail from the person who added it: "${input.hint}"\n` : ""}Scale the ingredient quantities for ${input.servings} servings.

If the name is vague (e.g. "dal", "sabzi"), assume the most common everyday version and say which one you assumed in the description.
Give the nutrition per ONE serving, not for all ${input.servings}.`;

  return askForObject<AiDishDetails>({
    system: `${INDIAN_KITCHEN_CONTEXT}\n\nYou are filling in the ingredient list and nutrition for one dish. Be practical and specific, never vague.`,
    prompt,
    tool,
    maxTokens: 3000,
  });
}
