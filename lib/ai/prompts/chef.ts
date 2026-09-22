import { KITCHEN_CONTEXT } from "./kitchen-context";
import { strictObject, arrayOf, str } from "./strict";

/* --------------------------------- schema --------------------------------- */

export const SCHEMA = strictObject({
  reply: str(
    "Your answer, in plain conversational English. Two to five sentences unless they asked for a list. " +
      "No markdown, no headings, no bullet characters — this is a chat message in a group chat.",
  ),
  dish_ideas: arrayOf(
    str("A dish name, exactly as it would be added to the plan."),
    "Any dishes you are actually recommending, so they can be added with one tap. Empty if none.",
  ),
});

export type ChefReply = {
  reply: string;
  dish_ideas: string[];
};

/* --------------------------------- prompts -------------------------------- */

export function system() {
  return `${KITCHEN_CONTEXT}

You are the cook-planner in a flat's group chat. Everyone who lives there can talk to you,
and everyone sees your replies, so you are talking to the room and not to one person.

How to behave:
- Answer the question that was asked. Do not restate their situation back at them.
- Be brief. This is a group chat, not an article. Two to five sentences.
- Be decisive. They are asking because they cannot decide. "Make chana masala tonight"
  beats "you could consider a few options".
- Respect every allergy absolutely, and every stated dislike.
- The flat is cooked for in one batch, so your answer has to work for all of them at
  once — if one person is vegetarian, the main dish is vegetarian.
- You can answer general food and nutrition questions too: whether something is enough
  protein, how to make a dish lighter, what to do with leftover rice. Stay practical.
- Never invent what they ate or planned. If you do not know, say so and ask.
- Do not moralise about anyone's diet or weight. They asked about dinner.

Write like a person texting the group, not like a chatbot introducing itself.`;
}

export type ChefContext = {
  /** Newest last, already trimmed to a sensible window. */
  conversation: { author: string; body: string; isAssistant: boolean }[];
  members: { name: string; diet: string; goal: string; allergies: string[]; dislikes: string[]; calories?: number; protein?: number }[];
  library: string[];
  plannedSoon: { date: string; slot: string; name: string }[];
  recentlyEaten: { date: string; slot: string; name: string }[];
  gaps: { nutrient: string; pctOfTarget: number }[];
  today: string;
  cookName: string | null;
};

export function user(ctx: ChefContext) {
  const lines: string[] = [`Today is ${ctx.today}.`];

  if (ctx.cookName) lines.push(`Their cook is ${ctx.cookName}.`);

  lines.push(
    ``,
    `Who lives here:`,
    ...ctx.members.map(
      (m) =>
        `- ${m.name}: ${m.diet}, goal ${m.goal}` +
        (m.calories ? `, about ${m.calories} kcal and ${m.protein}g protein a day` : "") +
        (m.allergies.length ? `, allergic to ${m.allergies.join(", ")}` : "") +
        (m.dislikes.length ? `, will not eat ${m.dislikes.join(", ")}` : ""),
    ),
  );

  if (ctx.plannedSoon.length) {
    lines.push(``, `Already planned:`, ...ctx.plannedSoon.map((p) => `- ${p.date} ${p.slot}: ${p.name}`));
  } else {
    lines.push(``, `Nothing is planned at the moment.`);
  }

  if (ctx.recentlyEaten.length) {
    lines.push(``, `Eaten in the last two weeks:`, ...ctx.recentlyEaten.map((r) => `- ${r.date} ${r.slot}: ${r.name}`));
  }

  if (ctx.library.length) {
    lines.push(``, `Dishes they have saved: ${ctx.library.join(", ")}.`);
  }

  if (ctx.gaps.length) {
    lines.push(
      ``,
      `Where the flat is short today, as a percentage of target:`,
      ...ctx.gaps.map((g) => `- ${g.nutrient}: ${g.pctOfTarget}%`),
      `Only mention this if it is relevant to what they asked.`,
    );
  }

  lines.push(
    ``,
    `The conversation so far, oldest first:`,
    ...ctx.conversation.map((m) => `${m.isAssistant ? "You" : m.author}: ${m.body}`),
    ``,
    `Reply to the last message.`,
  );

  return lines.join("\n");
}
