import type { Nutrition } from "@/lib/db/schema";

export type Sex = "male" | "female" | "other";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "Desk job, barely move",
  light: "Light — walk a bit, gym 1-2×/week",
  moderate: "Moderate — gym 3-4×/week",
  active: "Active — gym 5-6×/week",
  very_active: "Very active — physical job or 2× a day",
};

export const GOAL_LABELS: Record<Goal, string> = {
  lose: "Lose fat",
  maintain: "Stay the same",
  gain: "Build muscle",
};

/** Mifflin-St Jeor. The 'other' case uses the average of the male and female constants. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  return base - 78;
}

export type Targets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
} & Record<string, number>;

export type ProfileInput = {
  sex: Sex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: string;
  goal: string;
  calorieOverride?: number | null;
};

/** ICMR-NIN 2020 RDAs for Indian adults. Sodium is an upper limit, not a goal. */
function microTargets(sex: Sex): Record<string, number> {
  const female = sex === "female";
  return {
    iron_mg: female ? 29 : 19,
    calcium_mg: 1000,
    zinc_mg: female ? 13.2 : 17,
    magnesium_mg: female ? 370 : 440,
    potassium_mg: 3500,
    sodium_mg: 2000,
    vitamin_a_mcg: female ? 840 : 1000,
    vitamin_c_mg: 80,
    vitamin_d_mcg: 15,
    vitamin_b12_mcg: 2.2,
    folate_mcg: 300,
  };
}

/** Everything a person should hit in a day. Returns null until they fill in their stats. */
export function computeTargets(p: ProfileInput): Targets | null {
  const sex = (p.sex ?? "other") as Sex;
  let calories = p.calorieOverride ?? null;

  if (calories == null) {
    if (!p.age || !p.heightCm || !p.weightKg) return null;
    const activity = ACTIVITY_FACTORS[(p.activityLevel as Activity) ?? "light"] ?? 1.375;
    const tdee = bmr(sex, p.weightKg, p.heightCm, p.age) * activity;
    const adjust = p.goal === "lose" ? 0.82 : p.goal === "gain" ? 1.12 : 1;
    calories = Math.round((tdee * adjust) / 10) * 10;
  }

  // Protein scales with bodyweight; a cutting or bulking flatmate needs more.
  const weight = p.weightKg ?? calories / 30;
  const proteinPerKg = p.goal === "lose" ? 1.8 : p.goal === "gain" ? 1.7 : 1.3;
  const protein_g = Math.round(weight * proteinPerKg);

  const fat_g = Math.round((calories * 0.27) / 9);
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  const fiber_g = Math.round((calories / 1000) * 14);

  return { calories, protein_g, carbs_g, fat_g, fiber_g, ...microTargets(sex) };
}

export const NUTRIENT_LABELS: Record<string, string> = {
  calories: "Calories",
  protein_g: "Protein",
  carbs_g: "Carbs",
  fat_g: "Fat",
  fiber_g: "Fibre",
  iron_mg: "Iron",
  calcium_mg: "Calcium",
  zinc_mg: "Zinc",
  magnesium_mg: "Magnesium",
  potassium_mg: "Potassium",
  sodium_mg: "Sodium",
  vitamin_a_mcg: "Vitamin A",
  vitamin_c_mg: "Vitamin C",
  vitamin_d_mcg: "Vitamin D",
  vitamin_b12_mcg: "Vitamin B12",
  folate_mcg: "Folate",
};

export const NUTRIENT_UNITS: Record<string, string> = {
  calories: "kcal",
  protein_g: "g",
  carbs_g: "g",
  fat_g: "g",
  fiber_g: "g",
  iron_mg: "mg",
  calcium_mg: "mg",
  zinc_mg: "mg",
  magnesium_mg: "mg",
  potassium_mg: "mg",
  sodium_mg: "mg",
  vitamin_a_mcg: "µg",
  vitamin_c_mg: "mg",
  vitamin_d_mcg: "µg",
  vitamin_b12_mcg: "µg",
  folate_mcg: "µg",
};

export const MACRO_KEYS = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const;
export const MICRO_KEYS = [
  "iron_mg", "calcium_mg", "zinc_mg", "magnesium_mg", "potassium_mg",
  "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_b12_mcg", "folate_mcg", "sodium_mg",
] as const;

export function sumNutrition(items: (Nutrition | null | undefined)[]): Nutrition {
  const total: Record<string, number> = {};
  for (const n of items) {
    if (!n) continue;
    for (const [k, v] of Object.entries(n)) {
      if (typeof v === "number" && Number.isFinite(v)) total[k] = (total[k] ?? 0) + v;
    }
  }
  return total as Nutrition;
}

/** Fraction of target hit, capped for display purposes at 150%. */
export function pctOfTarget(value: number | undefined, target: number | undefined) {
  if (!target || !value) return 0;
  return Math.min(150, Math.round((value / target) * 100));
}
