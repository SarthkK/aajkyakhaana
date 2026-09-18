"use client";

import { useState } from "react";
import { MessageCircle, ThumbsDown, ThumbsUp, Sparkles, Crown, Lock } from "lucide-react";
import { api } from "@/lib/client";
import { cx, Avatar } from "@/components/ui";
import { tap } from "@/lib/haptics";
import type { PlanEntryView } from "@/lib/types";

export function VegDot({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      title={isVeg ? "Veg" : "Non-veg"}
      className={cx(
        "inline-flex items-center justify-center size-3.5 rounded-[3px] border shrink-0",
        isVeg ? "border-good" : "border-bad",
      )}
    >
      <span className={cx("size-1.5 rounded-full", isVeg ? "bg-good" : "bg-bad")} />
    </span>
  );
}

export function EntryCard({
  entry,
  onOpen,
  onChanged,
  /** Two or more dishes are competing for this slot. */
  contested = false,
  /** This is the one currently winning, or the one the cook will make once locked. */
  leading = false,
  /** Past the slot's lock time: the decision is made, voting is closed. */
  locked = false,
}: {
  entry: PlanEntryView;
  onOpen: () => void;
  onChanged: (patch: Partial<PlanEntryView>) => void;
  contested?: boolean;
  leading?: boolean;
  locked?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function vote(next: 1 | -1) {
    if (busy || locked) return;
    // Tapping the vote you already gave takes it back.
    const value = entry.myVote === next ? 0 : next;
    tap(value === 0 ? 4 : 10);
    setBusy(true);

    // Optimistic — voting should feel instant on a phone.
    const before = { myVote: entry.myVote, upVotes: entry.upVotes, downVotes: entry.downVotes };
    onChanged({
      myVote: value,
      upVotes: entry.upVotes - (before.myVote === 1 ? 1 : 0) + (value === 1 ? 1 : 0),
      downVotes: entry.downVotes - (before.myVote === -1 ? 1 : 0) + (value === -1 ? 1 : 0),
    });

    try {
      const res = await api.post<{ myVote: number; upVotes: number; downVotes: number; voters: PlanEntryView["voters"] }>(
        `/api/plan/${entry.id}/vote`,
        { value },
      );
      onChanged(res);
    } catch {
      onChanged(before);
    } finally {
      setBusy(false);
    }
  }

  const cancelled = entry.status === "cancelled";
  // Once the slot is locked, anything that did not win is visibly out of the running.
  const sidelined = locked && contested && !leading;

  return (
    <div
      className={cx(
        "bg-surface border rounded-2xl px-3.5 py-3 animate-in transition-colors",
        leading && contested ? "border-accent/50 bg-accent-soft/30" : "border-line",
        (cancelled || sidelined) && "opacity-55",
      )}
    >
      {contested && (
        <div className="flex items-center gap-1.5 mb-2">
          {leading ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-text bg-accent-soft border border-accent/30 rounded-full px-2 py-0.5">
              <Crown className="size-3" />
              {locked ? "Cook makes this" : "Winning"}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-muted">
              {locked ? "Not this time" : "Behind"}
            </span>
          )}
        </div>
      )}
      <div className="flex items-start gap-2.5">
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <VegDot isVeg={entry.dish.isVeg} />
            <span className={cx("font-medium leading-snug truncate", cancelled && "line-through")}>
              {entry.dish.name}
            </span>
            {entry.suggested && <Sparkles className="size-3.5 text-accent shrink-0" />}
          </div>

          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
            <Avatar emoji={entry.addedByEmoji} name={entry.addedByName} size="sm" />
            <span className="truncate">
              {entry.addedByName ? `${entry.addedByName.split(" ")[0]} added this` : "Added"}
              {entry.servings ? ` · ${entry.servings} servings` : ""}
            </span>
            {entry.commentCount > 0 && (
              <span className="inline-flex items-center gap-1 shrink-0">
                <MessageCircle className="size-3.5" />
                {entry.commentCount}
              </span>
            )}
          </div>

          {entry.dish.enrichStatus === "pending" && (
            <p className="text-[11px] text-muted mt-1.5">Ingredients not fetched yet</p>
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {locked ? (
            <span
              className="inline-flex items-center gap-1 h-9 px-2.5 rounded-xl bg-surface-2 border border-line text-xs font-semibold text-muted"
              title="Voting closed for this meal"
            >
              <Lock className="size-3.5" />
              {entry.upVotes > 0 && entry.upVotes}
            </span>
          ) : (
            <>
              <VoteButton
                active={entry.myVote === 1}
                count={entry.upVotes}
                onClick={() => vote(1)}
                tone="good"
                label="Yes"
              />
              <VoteButton
                active={entry.myVote === -1}
                count={entry.downVotes}
                onClick={() => vote(-1)}
                tone="bad"
                label="No"
              />
            </>
          )}
        </div>
      </div>

      {entry.note && <p className="text-xs text-muted mt-2 pl-6 italic">“{entry.note}”</p>}
    </div>
  );
}

function VoteButton({
  active,
  count,
  onClick,
  tone,
  label,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  tone: "good" | "bad";
  label: string;
}) {
  const Icon = tone === "good" ? ThumbsUp : ThumbsDown;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        "inline-flex items-center gap-1 h-9 min-w-9 px-2 rounded-xl border text-xs font-semibold pressable",
        active
          ? tone === "good"
            ? "bg-good-soft border-good/40 text-good"
            : "bg-bad-soft border-bad/40 text-bad"
          : "bg-surface-2 border-line text-muted",
      )}
    >
      <Icon className="size-4" />
      {count > 0 && count}
    </button>
  );
}
