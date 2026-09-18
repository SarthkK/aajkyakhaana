import { requireContext, handler, json } from "@/lib/api";
import { latestMessageId } from "@/lib/services/chat";

/**
 * The cheapest question the app asks: "is there anything newer than what I have?"
 *
 * This is the endpoint the 3-second poll hits. It reads one number from an index and
 * returns it, so the client only fetches actual content when this moves. Deliberately
 * separate from GET /api/chat so the common case — nothing happened — costs almost
 * nothing on a free-tier database that bills for being awake.
 */
export const GET = handler(async () => {
  const { household } = await requireContext();
  const latest = await latestMessageId(household.id);

  return json(
    { latest },
    // Never let a CDN or the browser answer this from cache.
    200,
  );
});
