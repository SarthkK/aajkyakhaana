import "server-only";
import Ably from "ably";
import { logger } from "@/lib/logger";

const log = logger("realtime");

/**
 * Nudges the flat's other devices that something changed.
 *
 * Deliberately carries no content. The message is "household X moved to cursor N" and
 * nothing else — the client then fetches from our own API, exactly as the poll already
 * did. Three reasons:
 *
 *  - No chat message, AI reply or name ever passes through a third party, which would
 *    otherwise undo the pseudonymisation work in lib/privacy.ts.
 *  - The payload is a few bytes, so a 6M-message monthly allowance is unreachable.
 *  - It replaces the 3-second timer rather than the fetch, so every existing code path
 *    stays exactly as it was and polling remains a working fallback.
 */

export const REALTIME_EVENTS = {
  /** The feed moved. Payload: { cursor }. */
  feed: "feed",
  /** The assistant is composing. Payload: { by }. Ephemeral, never stored. */
  thinking: "thinking",
} as const;

export function realtimeConfigured() {
  return Boolean(process.env.ABLY_API_KEY);
}

/** One channel per flat. Tokens are scoped so nobody can subscribe to another's. */
export function channelFor(householdId: string) {
  return `flat:${householdId}`;
}

let client: Ably.Rest | null = null;
function rest() {
  client ??= new Ably.Rest({ key: process.env.ABLY_API_KEY! });
  return client;
}

/**
 * Fire and forget. A realtime nudge failing must never fail the action that caused it
 * — the worst case is the other person's screen updates on the next poll instead.
 */
export function publish(householdId: string, event: string, data: Record<string, unknown> = {}) {
  if (!realtimeConfigured()) return;

  void rest()
    .channels.get(channelFor(householdId))
    .publish(event, data)
    .catch((err: unknown) => log.warn("could not publish", { householdId, event, err: String(err).slice(0, 120) }));
}

/** Mints a token that can only listen to this one flat, and cannot publish. */
export async function tokenFor(householdId: string, userId: string) {
  return rest().auth.createTokenRequest({
    clientId: userId,
    capability: { [channelFor(householdId)]: ["subscribe", "presence"] },
    ttl: 60 * 60 * 1000,
  });
}
