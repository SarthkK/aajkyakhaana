import "server-only";
import webpush from "web-push";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { householdMembers, profiles, pushSubscriptions, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

const log = logger("notifications");

/** Which switch on someone's profile governs this kind of message. */
export type NotificationKind = "meals" | "comments" | "locks";

const PREF_COLUMN = {
  meals: profiles.notifyMeals,
  comments: profiles.notifyComments,
  locks: profiles.notifyLocks,
} as const;

export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type Notification = {
  title: string;
  body: string;
  /** Where tapping it should land. */
  url: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string;
};

/**
 * Sends to everyone in the flat except whoever caused it, honouring each person's
 * preferences. Never throws: a flatmate's dead subscription must not fail the action
 * that triggered the message.
 */
export async function notifyHousehold(opts: {
  householdId: string;
  /** The person who did the thing — they already know, so they are skipped. */
  actorId: string;
  kind: NotificationKind;
  notification: Notification;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };

  if (!pushConfigured()) {
    log.debug("push not configured, skipping", { kind: opts.kind });
    return result;
  }

  try {
    const recipients = await db
      .select({ userId: users.id })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(
        and(
          eq(householdMembers.householdId, opts.householdId),
          ne(householdMembers.userId, opts.actorId),
          // A missing profile row means defaults, which are all "on".
          eq(PREF_COLUMN[opts.kind], true),
        ),
      );

    if (recipients.length === 0) return result;

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, recipients.map((r) => r.userId)));

    if (subs.length === 0) {
      result.skipped = recipients.length;
      return result;
    }

    configure();
    const payload = JSON.stringify(opts.notification);
    const expired: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 6 * 60 * 60 },
          );
          result.sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410 mean the browser threw the subscription away; stop trying it.
          if (status === 404 || status === 410) expired.push(sub.id);
          else log.warn("push failed", { status, endpoint: sub.endpoint.slice(0, 60) });
          result.failed++;
        }
      }),
    );

    if (expired.length) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, expired));
      log.info("cleaned up expired subscriptions", { count: expired.length });
    }

    log.info("notified household", { kind: opts.kind, ...result });
  } catch (err) {
    log.error("could not notify household", err, { householdId: opts.householdId, kind: opts.kind });
  }

  return result;
}

/** Fire and forget — the caller's own response must not wait on push delivery. */
export function notifyInBackground(opts: Parameters<typeof notifyHousehold>[0]) {
  void notifyHousehold(opts).catch(() => {});
}
