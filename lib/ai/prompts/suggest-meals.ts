import { KITCHEN_CONTEXT } from "./kitchen-context";
import { strictObject, arrayOf, str, bool, nullable, enumOf } from "./strict";

/* --------------------------------- schema --------------------------------- */

export const SCHEMA = strictObject({
  suggestions: arrayOf(
    strictObject({
      name: str("Dish name as Indians say it."),
      existing_dish_id: nullable(
        "string",
        "If this is a dish already in their library, its exact id from the list. Otherwise null.",
      ),
      reason: str(
        "One friendly sentence, max 140 chars, saying why this fits — variety, effort, weather, what they have been eating.",
      ),
      nutrition_note: nullable(
        "string",
        "Short note on which nutrient gap this helps close, e.g. 'Rajma pushes protein and iron up'. Null if there is nothing useful to say.",
      ),
      is_veg: bool("False if it contains meat, fish or eggs."),
      effort: enumOf(["easy", "medium", "involved"], "How much work it is for the cook."),
    }),
    "Exactly three genuinely different options, best first.",
  ),
});

/* --------------------------------- prompts -------------------------------- */

export function system() {
  return `${KITCHEN_CONTEXT}

You are suggesting what to cook. Be opinionated and concrete — people use this because they cannot decide.`;
}

export type SuggestContext = {
  slot: string;
  date: string;
  library: { id: string; name: string; course: string; isVeg: boolean; protein?: number; calories?: number }[];
  recent: { date: string; slot: string; name: string }[];
  plannedToday: { slot: string; name: string }[];
  members: { name: string; diet: string; goal: string; allergies: string[]; dislikes: string[] }[];
  gaps: { nutrient: string; pctOfTarget: number }[];
  /** Offered in the last few days and not taken up — do not offer them again. */
  recentlySuggested: string[];
};

export function user(ctx: SuggestContext) {
  const lines: string[] = [`Meal slot to fill: ${ctx.slot} on ${ctx.date}.`];

  if (ctx.plannedToday.length) {
    lines.push(
      ``,
      `Already planned that same day (do not clash or repeat):`,
      ...ctx.plannedToday.map((p) => `- ${p.slot}: ${p.name}`),
    );
  }

  lines.push(
    ``,
    `The flat (cook for all of them at once):`,
    ...ctx.members.map(
      (m) =>
        `- ${m.name}: ${m.diet}, goal ${m.goal}` +
        (m.allergies.length ? `, allergic to ${m.allergies.join(", ")}` : "") +
        (m.dislikes.length ? `, dislikes ${m.dislikes.join(", ")}` : ""),
    ),
  );

  if (ctx.library.length) {
    lines.push(
      ``,
      `Dishes already saved in their library. At most ONE of your three may come from`,
      `this list — the other two must be something they have not saved, or the same few`,
      `dishes come back every time. If you pick one, copy its id exactly into`,
      `existing_dish_id. For anything new, existing_dish_id must be null.`,
      ...ctx.library.map(
        (d) =>
          `- id ${d.id} — ${d.name} (${d.course}, ${d.isVeg ? "veg" : "non-veg"}` +
          (d.protein ? `, ${Math.round(d.protein)}g protein/serving` : "") +
          `)`,
      ),
    );
  } else {
    lines.push(``, `Their library is empty, so suggest fresh dishes and use null for every existing_dish_id.`);
  }

  if (ctx.recent.length) {
    lines.push(
      ``,
      `Eaten recently — do not repeat any of these:`,
      ...ctx.recent.map((r) => `- ${r.date} ${r.slot}: ${r.name}`),
    );
  }

  if (ctx.recentlySuggested.length) {
    lines.push(
      ``,
      `Already offered in the last few days and turned down. Suggesting them again is`,
      `the single most annoying thing you can do, so do not:`,
      ...ctx.recentlySuggested.map((name) => `- ${name}`),
    );
  }

  if (ctx.gaps.length) {
    lines.push(
      ``,
      `Where the flat is falling short today (percent of daily target currently covered):`,
      ...ctx.gaps.map((g) => `- ${g.nutrient}: ${g.pctOfTarget}%`),
      `Lean towards dishes that close these gaps, but never at the cost of it being something people actually want to eat.`,
    );
  }

  lines.push(
    ``,
    `Hard rules:`,
    `- Respect every allergy absolutely, and every dislike listed above.`,
    `- If anyone is vegetarian, at least two of the three options must be vegetarian.`,
    `  The third should be non-veg if anyone eats it, so they get something too.`,
    `- Keep it realistic for a cook making one batch for the whole flat on a weekday.`,
    ``,
    `The three must be genuinely different from each other, not three versions of the`,
    `same meal. Vary them on all of these:`,
    `- main protein — paneer, a dal, chana/rajma, egg, chicken, soya`,
    `- style — dry sabzi, gravy, one-pot rice, stuffed bread, curry with roti`,
    `- region — Punjabi, South Indian, Bengali, Gujarati, Maharashtrian, Indo-Chinese`,
    ``,
    `Paneer dishes are the obvious answer and get suggested far too often. Use paneer`,
    `in at most one of the three, and only if it genuinely beats a dal or a chana.`,
    ``,
    `Return exactly three suggestions.`,
  );

  return lines.join("\n");
}

/* ---------------------------------- types --------------------------------- */

export type Suggestion = {
  name: string;
  existing_dish_id: string | null;
  reason: string;
  nutrition_note: string | null;
  is_veg: boolean;
  effort: "easy" | "medium" | "involved";
};
