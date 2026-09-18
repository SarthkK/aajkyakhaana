import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { requireUserId, handler, json } from "@/lib/api";
import { pushConfigured } from "@/lib/services/notifications";
import { logger } from "@/lib/logger";

const log = logger("push");

const schema = z.object({
  endpoint: z.string().url().max(600),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

/** Registers this browser so the flat can reach the person on it. */
export const POST = handler(async (req: Request) => {
  const userId = await requireUserId();
  const body = schema.parse(await req.json());

  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      lastUsedAt: new Date(),
    })
    // The same browser re-subscribing should move the row to the current user, not
    // create a duplicate — flatmates do sign in on each other's phones.
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth, lastUsedAt: new Date() },
    });

  log.info("subscription registered", { userId });
  return json({ ok: true, configured: pushConfigured() });
});

/** Turns notifications off for this browser only. */
export const DELETE = handler(async (req: Request) => {
  const userId = await requireUserId();
  const endpoint = new URL(req.url).searchParams.get("endpoint");

  if (endpoint) {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  } else {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  log.info("subscription removed", { userId, scope: endpoint ? "this device" : "all devices" });
  return json({ ok: true });
});
