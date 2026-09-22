import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { aiEnabled, missingKeyName } from "@/lib/ai/client";
import { buildSuggestions } from "@/lib/services/suggest";
import { notifyInBackground } from "@/lib/services/notifications";
import { isValidDate, todayIn, SLOT_LABELS, friendlyDate, type Slot } from "@/lib/dates";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

const log = logger("chat.poll");

const schema = z.object({
  date: z.string().refine(isValidDate, "Pick a valid date").optional(),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
});

/**
 * Starts a vote in the chat: three AI suggestions everyone can pick between.
 *
 * The plan already has voting, but you have to know what you want before you can
 * propose it. This is for the far more common state — nobody has any idea — so the
 * app puts three options on the table and the flat picks one together.
 */
export const POST = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  if (!aiEnabled()) throw new ApiError(`AI is not configured. Add ${missingKeyName()} on the server.`, 503);

  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body ?? {});
  const date = input.date ?? todayIn(household.timezone);

  // Don't stack polls — one open question at a time is enough for a group chat.
  const [latest] = await db
    .select({ kind: messages.kind, meta: messages.meta })
    .from(messages)
    .where(eq(messages.householdId, household.id))
    .orderBy(desc(messages.id))
    .limit(1);

  if (latest?.kind === "poll" && !latest.meta?.resolvedDish) {
    throw new ApiError("There's already a vote running — settle that one first.", 409);
  }

  const suggestions = await buildSuggestions({ household, date, slot: input.slot });
  if (suggestions.length < 2) throw new ApiError("Could not come up with enough options. Try again.", 502);

  const options = suggestions.slice(0, 3).map((s) => ({
    name: s.name,
    isVeg: s.is_veg,
    reason: s.reason,
  }));

  const when = friendlyDate(date, todayIn(household.timezone)).toLowerCase();

  const [row] = await db
    .insert(messages)
    .values({
      householdId: household.id,
      userId,
      kind: "poll",
      body: `What are we having for ${when}'s ${SLOT_LABELS[input.slot as Slot].toLowerCase()}?`,
      meta: { options, pollSlot: input.slot, pollDate: date },
    })
    .returning();

  log.info("started a poll", { householdId: household.id, slot: input.slot, date });

  notifyInBackground({
    householdId: household.id,
    actorId: userId,
    kind: "meals",
    notification: {
      title: `Vote: ${when}'s ${SLOT_LABELS[input.slot as Slot].toLowerCase()}`,
      body: options.map((o) => o.name).join(" · "),
      url: "/chat",
      tag: `poll:${household.id}`,
    },
  });

  return json({ messageId: row.id }, 201);
});
