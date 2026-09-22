import "server-only";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { dishes, planEntries, messages, users } from "@/lib/db/schema";
import { askForObject } from "@/lib/ai/client";
import { chef } from "@/lib/ai/prompts";
import { summarizeDay } from "@/lib/summary";
import { todayIn, addDays } from "@/lib/dates";
import { logger } from "@/lib/logger";
import type { ActiveHousehold } from "@/lib/auth";

const log = logger("chef");

/** How much of the conversation to hand the model. Enough for context, not a novel. */
const CONVERSATION_WINDOW = 14;

/**
 * Answers a question asked in the flat's group chat.
 *
 * Everyone sees the answer, so it is written to the room rather than to the asker, and
 * it is given the same picture the app has — who lives here, what is planned, what has
 * been eaten, and where the week's nutrition is short.
 */
export async function askChef(household: ActiveHousehold): Promise<chef.ChefReply> {
  const today = todayIn(household.timezone);

  const [conversation, library, plannedSoon, recentlyEaten, summary] = await Promise.all([
    db
      .select({
        body: messages.body,
        kind: messages.kind,
        authorName: users.name,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.userId))
      .where(eq(messages.householdId, household.id))
      .orderBy(desc(messages.id))
      .limit(CONVERSATION_WINDOW),

    db
      .select({ name: dishes.name })
      .from(dishes)
      .where(eq(dishes.householdId, household.id))
      .limit(40),

    db
      .select({ date: planEntries.date, slot: planEntries.slot, name: dishes.name })
      .from(planEntries)
      .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
      .where(
        and(
          eq(planEntries.householdId, household.id),
          gte(planEntries.date, today),
          lte(planEntries.date, addDays(today, 6)),
        ),
      ),

    db
      .select({ date: planEntries.date, slot: planEntries.slot, name: dishes.name })
      .from(planEntries)
      .innerJoin(dishes, eq(dishes.id, planEntries.dishId))
      .where(
        and(
          eq(planEntries.householdId, household.id),
          gte(planEntries.date, addDays(today, -14)),
          lte(planEntries.date, addDays(today, -1)),
        ),
      )
      .limit(30),

    summarizeDay(household.id, today),
  ]);

  return askForObject<chef.ChefReply>({
    name: "chef_reply",
    description: "Reply to the flat's question about what to eat.",
    schema: chef.SCHEMA,
    system: chef.system(),
    prompt: chef.user({
      today,
      cookName: household.cookName,
      // Oldest first reads as a conversation.
      conversation: conversation.reverse().map((m) => ({
        author: m.authorName ?? "Someone",
        body: m.body,
        isAssistant: m.kind === "assistant",
      })),
      // First names only: free-tier prompts may be used for training, and a first name
      // is enough for the model to tell people apart in a reply.
      members: summary.members.map((m) => ({
        name: m.name.split(" ")[0],
        diet: m.diet,
        goal: m.goal,
        allergies: m.allergies,
        dislikes: m.dislikes,
        calories: m.targets?.calories,
        protein: m.targets?.protein_g,
      })),
      library: library.map((d) => d.name),
      plannedSoon,
      recentlyEaten,
      gaps: summary.gaps.slice(0, 5).map((g) => ({ nutrient: g.label, pctOfTarget: g.pctOfTarget })),
    }),
    maxTokens: 900,
  }).then((reply) => {
    log.info("answered a chat question", { householdId: household.id, ideas: reply.dish_ideas?.length ?? 0 });
    return reply;
  });
}
