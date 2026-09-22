import { z } from "zod";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { aiEnabled, missingKeyName } from "@/lib/ai/client";
import { planDays } from "@/lib/services/planner";
import { notifyInBackground } from "@/lib/services/notifications";
import type { Slot } from "@/lib/dates";

export const maxDuration = 60;

const schema = z.object({
  days: z.coerce.number().int().min(1).max(7).default(3),
  slots: z.array(z.enum(["breakfast", "lunch", "dinner"])).min(1).default(["breakfast", "lunch", "dinner"]),
  /** Anything the flat asked for in their own words. */
  request: z.string().trim().max(500).nullable().optional(),
});

/**
 * "Sort out our week." Plans several days at once and posts the result in the chat,
 * so everyone sees what was decided and why rather than finding it on the calendar.
 */
export const POST = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  if (!aiEnabled()) throw new ApiError(`AI is not configured. Add ${missingKeyName()} on the server.`, 503);

  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body ?? {});

  const plan = await planDays({
    household,
    userId,
    days: input.days,
    slots: input.slots as Slot[],
    request: input.request ?? null,
  });

  if (plan.added.length === 0) {
    // These are different failures and used to report the same, misleading message.
    throw plan.modelReturnedNothing
      ? new ApiError("Couldn't put a plan together just now. Try again.", 502)
      : new ApiError("Those days are already planned — nothing left to fill.", 409);
  }

  const lines = plan.added.map((m) => `${m.date} ${m.slot}: ${m.dish}`).join("\n");

  const [row] = await db
    .insert(messages)
    .values({
      householdId: household.id,
      userId: null,
      kind: "assistant",
      body: `${plan.summary}\n\n${lines}`,
      meta: null,
    })
    .returning();

  notifyInBackground({
    householdId: household.id,
    actorId: userId,
    kind: "meals",
    notification: {
      title: `Next ${input.days} days planned`,
      body: plan.added.map((m) => m.dish).slice(0, 4).join(" · "),
      url: "/plan",
      tag: `plan:${household.id}`,
    },
  });

  return json(
    {
      summary: plan.summary,
      added: plan.added,
      skipped: plan.skipped,
      message: {
        id: row.id,
        kind: "assistant" as const,
        body: row.body,
        planEntryId: null,
        meta: null,
        createdAt: row.createdAt.toISOString(),
        userId: null,
        authorName: null,
        authorEmoji: null,
      },
    },
    201,
  );
});
