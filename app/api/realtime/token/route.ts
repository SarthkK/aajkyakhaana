import { NextResponse } from "next/server";
import { requireContext, handler, json } from "@/lib/api";
import { realtimeConfigured, tokenFor } from "@/lib/realtime/server";

/**
 * Hands the browser a short-lived token scoped to its own flat.
 *
 * The Ably key never reaches the client, and the token grants subscribe only — a
 * browser cannot publish, so nobody can forge a nudge or listen to another flat.
 * Answers `{ realtime: false }` when it is not configured, which is the client's
 * signal to keep polling instead.
 */
export const GET = handler(async () => {
  const { userId, household } = await requireContext();

  if (!realtimeConfigured()) {
    return NextResponse.json({ realtime: false }, { status: 200 });
  }

  return json(await tokenFor(household.id, userId));
});
