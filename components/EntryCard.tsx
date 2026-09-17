"use client";

import { useState } from "react";
import { MessageCircle, ThumbsDown, ThumbsUp, Sparkles } from "lucide-react";
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
}: {
  entry: PlanEntryView;
  onOpen: () => void;
  onChanged: (patch: Partial<PlanEntryView>) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function vote(next: 1 | -1) {
    if (busy) return;
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

  return (
    <div
      className={cx(
        "bg-surface border border-line rounded-2xl px-3.5 py-3 animate-in",
        cancelled && "opacity-50",
      )}
    >
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
