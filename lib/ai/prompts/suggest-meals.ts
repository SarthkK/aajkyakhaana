import { KITCHEN_CONTEXT } from "./kitchen-context";

/* --------------------------------- schema --------------------------------- */

export const SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      // No minItems/maxItems: Groq's JSON decoder rejects a schema containing them.
      // The count is asked for in the prompt instead.
      type: "array",
      description: "Exactly three genuinely different options, best first.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Dish name as Indians say it." },
          existing_dish_id: {
            type: ["string", "null"],
            description: "If this is a dish already in their library, its exact id. Otherwise null.",
          },
          reason: {
            type: "string",
            description:
              "One friendly sentence, max 140 chars, saying why this fits — variety, effort, weather, what they have been eating.",
          },
          nutrition_note: {
            type: "string",
            description: "Short note on which nutrient gap this helps close, e.g. 'Rajma pushes protein and iron up'.",
          },
          is_veg: { type: "boolean" },
          effort: { type: "string", enum: ["easy", "medium", "involved"] },
        },
        required: ["name", "reason", "is_veg", "effort"],
      },
    },
  },
  required: ["suggestions"],
} as const;

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
      `Dishes already saved in their library (prefer these when they fit — pass the id as existing_dish_id):`,
      ...ctx.library.map(
        (d) =>
          `- [${d.id}] ${d.name} (${d.course}, ${d.isVeg ? "veg" : "non-veg"}` +
          (d.protein ? `, ${Math.round(d.protein)}g protein/serving` : "") +
          `)`,
      ),
    );
  } else {
    lines.push(``, `Their library is empty, so suggest fresh dishes.`);
  }

  if (ctx.recent.length) {
    lines.push(
      ``,
      `Eaten recently — avoid repeating these:`,
      ...ctx.recent.map((r) => `- ${r.date} ${r.slot}: ${r.name}`),
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
    `- Respect every allergy absolutely.`,
    `- If anyone is vegetarian, at least two of the three options must be vegetarian.`,
    `- Keep it realistic for a cook making one batch for the whole flat on a weekday.`,
    ``,
    `Return exactly three suggestions.`,
  );

  return lines.join("\n");
}

/* ---------------------------------- types --------------------------------- */

export type Suggestion = {
  name: string;
  existing_dish_id?: string | null;
  reason: string;
  nutrition_note?: string;
  is_veg: boolean;
  effort: "easy" | "medium" | "involved";
};
