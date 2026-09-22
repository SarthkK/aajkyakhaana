import { KITCHEN_CONTEXT } from "./kitchen-context";
import { strictObject, arrayOf, str, int, enumOf, nullable } from "./strict";

/* --------------------------------- schema --------------------------------- */

export const SCHEMA = strictObject({
  summary: str(
    "Two or three sentences for the group chat explaining the shape of the week — what you " +
      "balanced and why. Plain conversational English, no markdown, no bullets.",
  ),
  meals: arrayOf(
    strictObject({
      day_offset: int("Days from today: 0 is today, 1 is tomorrow, and so on."),
      slot: enumOf(["breakfast", "lunch", "dinner"], "Which meal."),
      dish: str("Dish name as Indians say it."),
      why: nullable("string", "One short clause on why it is there, or null."),
    }),
    "The plan, in order. Only the slots you are actually filling.",
  ),
});

export type PlannedMeal = {
  day_offset: number;
  slot: "breakfast" | "lunch" | "dinner";
  dish: string;
  why: string | null;
};

export type DietPlan = {
  summary: string;
  meals: PlannedMeal[];
};

/* --------------------------------- prompts -------------------------------- */

export function system() {
  return `${KITCHEN_CONTEXT}

You are planning several days of meals for a shared flat, to be cooked in one batch each time.

What a good plan looks like:
- Every day's meals add up to roughly what these people need, without anyone counting anything.
- Variety across the week. The same dal twice in three days is a failed plan.
- Weekday meals are quick; the weekend can take longer.
- Breakfast is light and fast. Lunch is the substantial one. Dinner is lighter than lunch.
- It reuses ingredients sensibly, so one grocery run covers the week and nothing rots.
- It is food these particular people will actually eat, not a nutritionist's fantasy.

Respect every allergy absolutely and every dislike. If anyone is vegetarian, every
shared dish is vegetarian — you are cooking one pot, not two.`;
}

export type PlannerContext = {
  days: number;
  slots: string[];
  today: string;
  members: {
    name: string;
    diet: string;
    goal: string;
    allergies: string[];
    dislikes: string[];
    calories?: number;
    protein?: number;
  }[];
  library: string[];
  recentlyEaten: { date: string; slot: string; name: string }[];
  alreadyPlanned: { date: string; slot: string; name: string }[];
  request: string | null;
};

export function user(ctx: PlannerContext) {
  const lines: string[] = [
    `Plan the next ${ctx.days} days, starting today (${ctx.today}).`,
    `Fill these slots each day: ${ctx.slots.join(", ")}.`,
  ];

  lines.push(
    ``,
    `Who you are cooking for:`,
    ...ctx.members.map(
      (m) =>
        `- ${m.name}: ${m.diet}, goal ${m.goal}` +
        (m.calories ? `, needs about ${m.calories} kcal and ${m.protein}g protein a day` : "") +
        (m.allergies.length ? `, ALLERGIC to ${m.allergies.join(", ")}` : "") +
        (m.dislikes.length ? `, will not eat ${m.dislikes.join(", ")}` : ""),
    ),
  );

  if (ctx.alreadyPlanned.length) {
    lines.push(
      ``,
      `Already decided — leave these alone and plan around them:`,
      ...ctx.alreadyPlanned.map((p) => `- ${p.date} ${p.slot}: ${p.name}`),
    );
  }

  if (ctx.recentlyEaten.length) {
    lines.push(
      ``,
      `Eaten in the last two weeks — do not repeat these:`,
      ...ctx.recentlyEaten.map((r) => `- ${r.date} ${r.slot}: ${r.name}`),
    );
  }

  if (ctx.library.length) {
    lines.push(
      ``,
      `Dishes they already make: ${ctx.library.join(", ")}.`,
      `Use a few of these so it feels like their kitchen, but not most of them. This is`,
      `background only — if any of it looks odd or incomplete, ignore it and plan anyway.`,
    );
  }

  if (ctx.request) {
    lines.push(``, `What they asked for, which takes priority over everything above except allergies:`, ctx.request);
  }

  lines.push(
    ``,
    `Fill every slot listed above for every one of the ${ctx.days} days, except those`,
    `already decided. day_offset runs from 0 (today) to ${ctx.days - 1} (the last day).`,
    `That is up to ${ctx.days * ctx.slots.length} meals — return them all.`,
    ``,
    `Never return an empty list, and never refuse. You always have enough to work with:`,
    `if you know nothing about these people beyond their diet, plan good everyday Indian`,
    `home food for that diet. Missing or strange-looking background is not a reason to`,
    `decline — it just means you choose.`,
  );

  return lines.join("\n");
}
