import "server-only";
import { askForObject } from "./client";
import { suggestMeals } from "./prompts";
import { logger } from "@/lib/logger";

export type { Suggestion, SuggestContext } from "./prompts/suggest-meals";

const log = logger("ai.suggest");

/** "Nobody has added anything — what should we eat?" */
export async function suggestMealsFor(ctx: suggestMeals.SuggestContext): Promise<suggestMeals.Suggestion[]> {
  const out = await log.time(
    "suggested meals",
    () =>
      askForObject<{ suggestions: suggestMeals.Suggestion[] }>({
        name: "propose_meals",
        description: "Propose what this Indian flat should eat for a specific meal slot.",
        schema: suggestMeals.SCHEMA,
        system: suggestMeals.system(),
        prompt: suggestMeals.user(ctx),
        maxTokens: 1500,
      }),
    { slot: ctx.slot, date: ctx.date, librarySize: ctx.library.length },
  );

  if (!out?.suggestions?.length) {
    log.warn("model returned no usable suggestions", { received: JSON.stringify(out).slice(0, 300) });
  }
  return out.suggestions ?? [];
}
