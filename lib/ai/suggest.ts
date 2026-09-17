import "server-only";
import { askForObject, INDIAN_KITCHEN_CONTEXT } from "./client";

export type Suggestion = {
  name: string;
  existing_dish_id?: string | null;
  reason: string;
  nutrition_note?: string;
  is_veg: boolean;
  effort: "easy" | "medium" | "involved";
};

export type SuggestContext = {
  slot: string;
  date: string;
  /** Dishes already in the flat's library — reuse these when they fit. */
  library: { id: string; name: string; course: string; isVeg: boolean; protein?: number; calories?: number }[];
  /** What was cooked/planned recently, so we do not repeat it. */
  recent: { date: string; slot: string; name: string }[];
  /** Already planned for this same day. */
  plannedToday: { slot: string; name: string }[];
  members: {
    name: string;
    diet: string;
    goal: string;
    allergies: string[];
    dislikes: string[];
  }[];
  /** Nutrients the flat is collectively short on today, worst first. */
  gaps: { nutrient: string; pctOfTarget: number }[];
};

const tool = {
  name: "propose_meals",
  description: "Propose what this Indian flat should eat for a specific meal slot.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        description: "Three genuinely different options, best first.",
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
  },
};

export async function suggestMeals(ctx: SuggestContext): Promise<Suggestion[]> {
  const lines: string[] = [];
  lines.push(`Meal slot to fill: ${ctx.slot} on ${ctx.date}.`);

  if (ctx.plannedToday.length) {
    lines.push(
      `\nAlready planned that same day (do not clash or repeat):\n` +
        ctx.plannedToday.map((p) => `- ${p.slot}: ${p.name}`).join("\n"),
    );
  }

  lines.push(
    `\nThe flat (cook for all of them at once):\n` +
      ctx.members
        .map(
          (m) =>
            `- ${m.name}: ${m.diet}, goal ${m.goal}` +
            (m.allergies.length ? `, allergic to ${m.allergies.join(", ")}` : "") +
            (m.dislikes.length ? `, dislikes ${m.dislikes.join(", ")}` : ""),
        )
        .join("\n"),
  );

  if (ctx.library.length) {
    lines.push(
      `\nDishes already saved in their library (prefer these when they fit — pass the id as existing_dish_id):\n` +
        ctx.library
          .map((d) => `- [${d.id}] ${d.name} (${d.course}, ${d.isVeg ? "veg" : "non-veg"}${d.protein ? `, ${Math.round(d.protein)}g protein/serving` : ""})`)
          .join("\n"),
    );
  } else {
    lines.push(`\nTheir library is empty, so suggest fresh dishes.`);
  }

  if (ctx.recent.length) {
    lines.push(
      `\nEaten recently — avoid repeating these:\n` +
        ctx.recent.map((r) => `- ${r.date} ${r.slot}: ${r.name}`).join("\n"),
    );
  }

  if (ctx.gaps.length) {
    lines.push(
      `\nWhere the flat is falling short today (percent of daily target currently covered):\n` +
        ctx.gaps.map((g) => `- ${g.nutrient}: ${g.pctOfTarget}%`).join("\n") +
        `\nLean towards dishes that close these gaps, but never at the cost of it being something people actually want to eat.`,
    );
  }

  lines.push(
    `\nHard rules: respect every allergy absolutely. If anyone is vegetarian, at least two of the three options must be vegetarian.
Keep it realistic for a cook making one batch for the whole flat on a weekday.`,
  );

  const out = await askForObject<{ suggestions: Suggestion[] }>({
    system: `${INDIAN_KITCHEN_CONTEXT}\n\nYou are suggesting what to cook. Be opinionated and concrete — people use this because they cannot decide.`,
    prompt: lines.join("\n"),
    tool,
    maxTokens: 1500,
  });

  if (!out?.suggestions?.length) {
    console.warn("[ai] suggest returned nothing usable:", JSON.stringify(out).slice(0, 600));
  }
  return out.suggestions ?? [];
}
