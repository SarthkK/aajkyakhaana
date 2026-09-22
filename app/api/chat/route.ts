import { z } from "zod";
import { requireContext, handler, json } from "@/lib/api";
import { messagesSince, recentMessages, postMessage, latestMessageId, MAX_BODY } from "@/lib/services/chat";
import { notifyInBackground } from "@/lib/services/notifications";
import { publish, REALTIME_EVENTS } from "@/lib/realtime/server";

const querySchema = z.object({ after: z.coerce.number().int().min(0).optional() });
const postSchema = z.object({ body: z.string().trim().min(1, "Say something").max(MAX_BODY) });

/** With `after`, only what is new. Without it, the most recent page. */
export const GET = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const after = querySchema.parse({
    after: new URL(req.url).searchParams.get("after") ?? undefined,
  }).after;

  const list =
    after !== undefined
      ? await messagesSince(household.id, after, userId)
      : await recentMessages(household.id, userId);
  const latest = list.length ? list[list.length - 1].id : await latestMessageId(household.id);

  return json({ messages: list, latest });
});

export const POST = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const { body } = postSchema.parse(await req.json());

  const message = await postMessage({ householdId: household.id, userId, body });
  publish(household.id, REALTIME_EVENTS.feed, { cursor: message.id });

  notifyInBackground({
    householdId: household.id,
    actorId: userId,
    kind: "comments",
    notification: {
      title: message.authorName ?? "Your flat",
      body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
      url: "/chat",
      // One notification for the conversation, replaced as it moves on.
      tag: `chat:${household.id}`,
    },
  });

  return json({ message }, 201);
});
