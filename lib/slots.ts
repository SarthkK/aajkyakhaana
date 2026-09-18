import { SLOTS, type Slot, todayIn } from "@/lib/dates";

/**
 * How a contested meal gets settled.
 *
 * A single proposal is simply the plan — no vote needed, which is most slots. Voting
 * only matters when two or more dishes are proposed for the same meal.
 *
 * Each slot locks at a time set by the flat, a little before the cook arrives. Up to
 * then people propose and vote freely. At lock the slot resolves on its own, with no
 * one having to "close" it: most votes wins, and a tie — including nobody voting at
 * all — goes to whatever was proposed first. Deterministic, silent, and it always
 * produces an answer by the time someone has to start cooking.
 */

export type LockTimes = {
  breakfastLockAt: string;
  lunchLockAt: string;
  dinnerLockAt: string;
  timezone: string;
};

const DEFAULT_LOCKS: Record<Slot, string> = {
  breakfast: "07:00",
  lunch: "10:30",
  dinner: "17:30",
  // Snacks are casual; effectively never locked.
  snack: "23:59",
};

export function lockTimeFor(slot: Slot, household?: Partial<LockTimes>): string {
  if (slot === "breakfast") return household?.breakfastLockAt || DEFAULT_LOCKS.breakfast;
  if (slot === "lunch") return household?.lunchLockAt || DEFAULT_LOCKS.lunch;
  if (slot === "dinner") return household?.dinnerLockAt || DEFAULT_LOCKS.dinner;
  return DEFAULT_LOCKS.snack;
}

/** Local "HH:MM" wall-clock time in the flat's timezone. */
export function timeNowIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/** True once the flat can no longer change its mind about this meal. */
export function isSlotLocked(
  date: string,
  slot: Slot,
  household: Partial<LockTimes> | undefined,
  now = new Date(),
): boolean {
  const timezone = household?.timezone || "Asia/Kolkata";
  const today = todayIn(timezone, now);

  if (date < today) return true;
  if (date > today) return false;
  return timeNowIn(timezone, now) >= lockTimeFor(slot, household);
}

export type VotableEntry = {
  id: string;
  upVotes: number;
  createdAt: string;
  status: string;
};

export type SlotOutcome<T extends VotableEntry> = {
  /** More than one dish is in the running. */
  contested: boolean;
  locked: boolean;
  /** The dish the cook should make. Null only when nothing is proposed. */
  winner: T | null;
  /** Everything else, in the order it will be offered to move to another day. */
  runnersUp: T[];
};

/**
 * Most upvotes wins; a tie goes to whichever was proposed first. Cancelled entries are
 * out of the running entirely.
 */
export function resolveSlot<T extends VotableEntry>(
  entries: T[],
  opts: { locked: boolean },
): SlotOutcome<T> {
  const live = entries.filter((e) => e.status !== "cancelled");

  if (live.length === 0) {
    return { contested: false, locked: opts.locked, winner: null, runnersUp: [] };
  }

  const ranked = [...live].sort((a, b) => {
    if (b.upVotes !== a.upVotes) return b.upVotes - a.upVotes;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return {
    contested: live.length > 1,
    locked: opts.locked,
    winner: ranked[0],
    runnersUp: ranked.slice(1),
  };
}

/** Is the cook off today? 0 = Sunday, matching Date#getDay. */
export function isCookOff(date: string, cookOffDays: number[] | undefined): boolean {
  if (!cookOffDays?.length) return false;
  const [y, m, d] = date.split("-").map(Number);
  return cookOffDays.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

export { SLOTS, type Slot };
