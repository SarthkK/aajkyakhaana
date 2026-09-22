import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { aiEnabled, missingKeyName } from "@/lib/ai/client";
import { askChef } from "@/lib/services/chef";
import { notifyInBackground } from "@/lib/services/notifications";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

const log = logger("chat.ask");

/**
 * Generates the assistant's reply to whatever was last said in the flat's chat.
 *
 * Deliberately a separate call from posting the message: the question should appear in
 * everyone's feed immediately, and the answer arrive a moment later, the way a person
 * typing would. It also means a slow or failed model never costs anyone their message.
 */
export const POST = handler(async () => {
  const { userId, household } = await requireContext();
  if (!aiEnabled()) throw new ApiError(`AI is not configured. Add ${missingKeyName()} on the server.`, 503);

  // Refuse to answer twice in a row — usually a double tap, occasionally a loop.
  const [latest] = await db
    .select({ kind: messages.kind })
    .from(messages)
    .where(eq(messages.householdId, household.id))
    .orderBy(desc(messages.id))
    .limit(1);

  if (latest?.kind === "assistant") {
    throw new ApiError("Already answered — ask something new.", 409);
  }

  const answer = await askChef(household);

  const [row] = await db
    .insert(messages)
    .values({
      householdId: household.id,
      userId: null,
      kind: "assistant",
      body: answer.reply,
      meta: answer.dish_ideas?.length ? { dishIdeas: answer.dish_ideas.slice(0, 4) } : null,
    })
    .returning();

  log.info("posted an assistant reply", { householdId: household.id });

  notifyInBackground({
    householdId: household.id,
    actorId: userId,
    kind: "comments",
    notification: {
      title: "Kitchen AI",
      body: answer.reply.length > 140 ? `${answer.reply.slice(0, 140)}…` : answer.reply,
      url: "/chat",
      tag: `chat:${household.id}`,
    },
  });

  return json({
    message: {
      id: row.id,
      kind: "assistant" as const,
      body: row.body,
      planEntryId: null,
      meta: row.meta,
      createdAt: row.createdAt.toISOString(),
      userId: null,
      authorName: null,
      authorEmoji: null,
    },
  }, 201);
});
