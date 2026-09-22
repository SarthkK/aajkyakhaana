import "server-only";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, pollVotes, users, type MessageKind, type MessageMeta } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

const log = logger("chat");

export const MAX_BODY = 1000;
export const PAGE_SIZE = 60;

export type FeedMessage = {
  id: number;
  kind: MessageKind;
  body: string;
  planEntryId: string | null;
  meta: MessageMeta | null;
  createdAt: string;
  userId: string | null;
  authorName: string | null;
  authorEmoji: string | null;
  /** Poll rows only: how many picked each option, and which one you picked. */
  pollTally?: number[];
  myPollVote?: number | null;
};

/**
 * Fills in vote counts for any polls in a page of the feed.
 *
 * Done in one query for the whole page rather than per row — a poll is just another
 * message, and the feed is fetched constantly, so this must not become N+1.
 */
async function withPollTallies(rows: FeedMessage[], viewerId: string): Promise<FeedMessage[]> {
  const pollIds = rows.filter((r) => r.kind === "poll").map((r) => r.id);
  if (pollIds.length === 0) return rows;

  const cast = await db
    .select({ messageId: pollVotes.messageId, userId: pollVotes.userId, optionIndex: pollVotes.optionIndex })
    .from(pollVotes)
    .where(inArray(pollVotes.messageId, pollIds));

  return rows.map((row) => {
    if (row.kind !== "poll") return row;
    const mine = cast.find((v) => v.messageId === row.id && v.userId === viewerId);
    const options = row.meta?.options ?? [];
    return {
      ...row,
      pollTally: options.map((_, i) => cast.filter((v) => v.messageId === row.id && v.optionIndex === i).length),
      myPollVote: mine ? mine.optionIndex : null,
    };
  });
}

/**
 * The newest id in this flat's feed, and nothing else.
 *
 * This is what the 3-second poll hits. It resolves to an index-only scan on
 * (household_id, id), which is cheap enough to run constantly without keeping a
 * free-tier database busy enough to matter. The full feed is only fetched when this
 * number actually moves.
 */
export async function latestMessageId(householdId: string): Promise<number> {
  const [row] = await db
    .select({ latest: sql<number>`coalesce(max(${messages.id}), 0)::int` })
    .from(messages)
    .where(eq(messages.householdId, householdId));
  return row?.latest ?? 0;
}

/** Everything after a cursor, oldest first. Used after the cursor says something changed. */
export async function messagesSince(householdId: string, after: number, viewerId: string): Promise<FeedMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      kind: messages.kind,
      body: messages.body,
      planEntryId: messages.planEntryId,
      meta: messages.meta,
      createdAt: messages.createdAt,
      userId: messages.userId,
      authorName: users.name,
      authorEmoji: users.emoji,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.userId))
    .where(and(eq(messages.householdId, householdId), gt(messages.id, after)))
    .orderBy(asc(messages.id))
    .limit(PAGE_SIZE);

  return withPollTallies(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), viewerId);
}

/** The most recent page, oldest first — what a freshly opened chat shows. */
export async function recentMessages(householdId: string, viewerId: string): Promise<FeedMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      kind: messages.kind,
      body: messages.body,
      planEntryId: messages.planEntryId,
      meta: messages.meta,
      createdAt: messages.createdAt,
      userId: messages.userId,
      authorName: users.name,
      authorEmoji: users.emoji,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.userId))
    .where(eq(messages.householdId, householdId))
    .orderBy(desc(messages.id))
    .limit(PAGE_SIZE);

  return withPollTallies(rows.reverse().map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), viewerId);
}

export async function postMessage(input: {
  householdId: string;
  userId: string;
  body: string;
}): Promise<FeedMessage> {
  const [row] = await db
    .insert(messages)
    .values({
      householdId: input.householdId,
      userId: input.userId,
      kind: "text",
      body: input.body.slice(0, MAX_BODY),
    })
    .returning();

  const [author] = await db
    .select({ name: users.name, emoji: users.emoji })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  return {
    id: row.id,
    kind: "text",
    body: row.body,
    planEntryId: null,
    meta: null,
    createdAt: row.createdAt.toISOString(),
    userId: input.userId,
    authorName: author?.name ?? null,
    authorEmoji: author?.emoji ?? null,
  };
}

/**
 * Records something that happened to the plan, so the feed reads as one story rather
 * than chat in one place and decisions in another. Never throws: a failed feed entry
 * must not fail the action it describes.
 */
export async function postEvent(input: {
  householdId: string;
  userId: string | null;
  kind: Exclude<MessageKind, "text">;
  body: string;
  planEntryId?: string | null;
  meta?: MessageMeta;
}): Promise<void> {
  try {
    await db.insert(messages).values({
      householdId: input.householdId,
      userId: input.userId,
      kind: input.kind,
      body: input.body,
      planEntryId: input.planEntryId ?? null,
      meta: input.meta ?? null,
    });
  } catch (err) {
    log.error("could not record a feed event", err, { kind: input.kind, householdId: input.householdId });
  }
}

/** Fire and forget — the caller's own response must not wait on the feed. */
export function recordEvent(input: Parameters<typeof postEvent>[0]) {
  void postEvent(input).catch(() => {});
}
