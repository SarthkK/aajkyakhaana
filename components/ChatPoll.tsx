"use client";

import { useState } from "react";
import { Check, Dices, Trophy } from "lucide-react";
import { api } from "@/lib/client";
import { Button, cx } from "@/components/ui";
import { VegDot } from "@/components/EntryCard";
import { useToast } from "@/components/Toast";
import { tap } from "@/lib/haptics";
import type { FeedMessage } from "@/lib/types";

/**
 * A vote on three AI suggestions, played out in the chat.
 *
 * The plan already has voting, but you have to know what you want before you can
 * propose anything. This is for the far more common state — nobody has any idea — so
 * the app puts three on the table and the flat picks one together.
 */
export function ChatPoll({
  message,
  onChanged,
}: {
  message: FeedMessage;
  onChanged: () => void;
}) {
  const toast = useToast();
  const options = message.meta?.options ?? [];
  const [tally, setTally] = useState<number[]>(message.pollTally ?? options.map(() => 0));
  const [mine, setMine] = useState<number | null>(message.myPollVote ?? null);
  const [busy, setBusy] = useState(false);

  const settled = message.meta?.resolvedDish;
  const total = tally.reduce((a, b) => a + b, 0);

  async function pick(index: number) {
    if (busy || settled) return;
    tap();
    const previous = { tally, mine };

    // Optimistic: a vote in a group chat should land the instant you tap it.
    setTally((t) => {
      const next = [...t];
      if (mine !== null) next[mine] = Math.max(0, next[mine] - 1);
      next[index] += 1;
      return next;
    });
    setMine(index);
    setBusy(true);

    try {
      const res = await api.post<{ tally: number[]; myVote: number }>(
        `/api/chat/poll/${message.id}/vote`,
        { option: index },
      );
      setTally(res.tally);
      setMine(res.myVote);
    } catch (err) {
      setTally(previous.tally);
      setMine(previous.mine);
      toast(err instanceof Error ? err.message : "Could not record that", { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function settle() {
    setBusy(true);
    try {
      const res = await api.post<{ winner: string; createdDish: { id: string } | null }>(
        `/api/chat/poll/${message.id}/resolve`,
      );
      toast(`${res.winner} it is — added to the plan`);
      // A brand new dish has no ingredients yet; fetch them quietly.
      if (res.createdDish) {
        void api.post(`/api/dishes/${res.createdDish.id}/enrich`).then(onChanged).catch(() => {});
      }
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not settle it", { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-3.5 my-1">
      <p className="text-xs font-semibold text-accent-text inline-flex items-center gap-1.5 mb-1">
        <Dices className="size-3.5" /> Dinner roulette
      </p>
      <p className="text-sm font-medium mb-3">{message.body}</p>

      <div className="space-y-1.5">
        {options.map((option, i) => {
          const count = tally[i] ?? 0;
          const share = total > 0 ? (count / total) * 100 : 0;
          const chosen = mine === i;
          const won = Boolean(settled) && settled === option.name;

          return (
            <button
              key={option.name}
              onClick={() => pick(i)}
              disabled={Boolean(settled) || busy}
              className={cx(
                "relative w-full overflow-hidden rounded-xl border text-left px-3 py-2.5 pressable",
                chosen ? "border-accent bg-surface" : "border-line bg-surface",
                won && "border-good",
                settled && !won && "opacity-50",
              )}
            >
              {/* The bar is the tally — no separate chart, just the row filling up. */}
              <span
                aria-hidden
                className={cx(
                  "absolute inset-y-0 left-0 transition-all duration-300",
                  won ? "bg-good-soft" : "bg-accent-soft",
                )}
                style={{ width: `${share}%` }}
              />
              <span className="relative flex items-center gap-2">
                <VegDot isVeg={option.isVeg} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{option.name}</span>
                  <span className="block text-[11px] text-muted leading-snug line-clamp-2">{option.reason}</span>
                </span>
                {won ? (
                  <Trophy className="size-4 text-good shrink-0" />
                ) : chosen ? (
                  <Check className="size-4 text-accent shrink-0" />
                ) : count > 0 ? (
                  <span className="text-xs font-semibold text-muted shrink-0 tabular-nums">{count}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {settled ? (
        <p className="text-[11px] text-muted mt-2.5 inline-flex items-center gap-1">
          <Trophy className="size-3" /> {settled} won and is on the plan
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="text-[11px] text-muted">
            {total === 0 ? "No votes yet" : `${total} vote${total === 1 ? "" : "s"}`}
          </span>
          <Button size="sm" variant="secondary" onClick={settle} loading={busy} disabled={total === 0}>
            Lock it in
          </Button>
        </div>
      )}
    </div>
  );
}
