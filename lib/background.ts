import "server-only";
import { waitUntil } from "@vercel/functions";

/**
 * Runs work that must finish but must not delay the response.
 *
 * `void promise` is not enough on Vercel. Once the response is sent the instance can be
 * suspended, and an outbound request that has not finished stops mid-flight — it resumes
 * only when that instance is next woken by another request. That is what made realtime
 * nudges and push notifications arrive one action late: tests/realtime-live.mjs watched
 * every nudge land inside the *next* test's window. The giveaway was that the "thinking"
 * nudge, published *before* the slow model call, always arrived, while the reply nudge,
 * published just before the response, did not.
 *
 * `waitUntil` keeps the instance alive until the promise settles, without the caller
 * waiting on it. Off Vercel there is nothing to suspend, so the bare promise is already
 * correct — hence the fallback rather than a hard requirement.
 */
export function runAfterResponse(work: Promise<unknown>, onError?: (err: unknown) => void) {
  const guarded = work.catch((err: unknown) => onError?.(err));
  try {
    waitUntil(guarded);
  } catch {
    void guarded; // local dev, tests and scripts: the process outlives the handler anyway
  }
}
