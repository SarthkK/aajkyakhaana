"use client";

import { useState } from "react";
import { Trash2, RefreshCw, Send, Pencil, ChefHat } from "lucide-react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { Sheet, Button, Input, Loading, ErrorNote, Avatar, cx } from "@/components/ui";
import { VegDot } from "@/components/EntryCard";
import { NutritionChips } from "@/components/Nutrition";
import { useSession } from "@/components/SessionProvider";
import type { PlanEntryView, DishWithIngredients, CommentView } from "@/lib/types";

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function EntryDetailSheet({
  entry,
  onClose,
  onChanged,
}: {
  entry: PlanEntryView | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useSession();
  const dishId = entry?.dishId ?? null;

  const { data: dishData, reload: reloadDish } = useApi<{ dish: DishWithIngredients }>(
    dishId ? `/api/dishes/${dishId}` : null,
  );
  const { data: commentData, setData: setCommentData } = useApi<{ comments: CommentView[] }>(
    entry ? `/api/plan/${entry.id}/comments` : null,
  );

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!entry) return null;

  const dish = dishData?.dish;
  const comments = commentData?.comments ?? [];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!entry || !body.trim()) return;
    setSending(true);
    try {
      const res = await api.post<{ comment: CommentView }>(`/api/plan/${entry.id}/comments`, { body });
      setCommentData({ comments: [...comments, res.comment] });
      setBody("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post that");
    } finally {
      setSending(false);
    }
  }

  async function removeEntry() {
    if (!entry) return;
    setBusy(true);
    try {
      await api.del(`/api/plan/${entry.id}`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove it");
      setBusy(false);
    }
  }

  async function refetchIngredients() {
    if (!dish) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/dishes/${dish.id}/enrich`);
      await reloadDish();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  const yes = entry.voters.filter((v) => v.value > 0);
  const no = entry.voters.filter((v) => v.value < 0);

  return (
    <Sheet open={Boolean(entry)} onClose={onClose} title={entry.dish.name}>
      <div className="flex items-center gap-2 text-sm text-muted mb-4">
        <VegDot isVeg={entry.dish.isVeg} />
        <span>{entry.dish.isVeg ? "Veg" : "Non-veg"}</span>
        {dish?.prepMinutes ? <span>· {dish.prepMinutes} min</span> : null}
        {entry.servings ? <span>· {entry.servings} servings</span> : null}
        {entry.suggested && <span className="text-accent-text">· AI suggested</span>}
      </div>

      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      {(yes.length > 0 || no.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
          {yes.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-good font-semibold">Up for it</span>
              {yes.map((v) => <Avatar key={v.userId} emoji={v.emoji} name={v.name} size="sm" />)}
            </span>
          )}
          {no.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-bad font-semibold">Not keen</span>
              {no.map((v) => <Avatar key={v.userId} emoji={v.emoji} name={v.name} size="sm" />)}
            </span>
          )}
        </div>
      )}

      {dish?.nutrition && (
        <section className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Per serving</h3>
          <NutritionChips nutrition={dish.nutrition} showMicros />
        </section>
      )}

      <section className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Ingredients {dish ? `(for ${dish.baseServings})` : ""}
          </h3>
          {dish && (
            <Link href={`/dishes/${dish.id}`} className="text-xs text-accent-text font-medium inline-flex items-center gap-1">
              <Pencil className="size-3" /> Edit
            </Link>
          )}
        </div>

        {!dish ? (
          <Loading label="Loading…" />
        ) : dish.ingredients.length === 0 ? (
          <div className="text-sm text-muted bg-surface-2 rounded-2xl p-4">
            <p className="leading-relaxed">
              {dish.enrichStatus === "pending"
                ? "Ingredients haven't been fetched yet."
                : dish.enrichError || "Couldn't fetch ingredients for this one."}
            </p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={refetchIngredients} loading={busy}>
              <RefreshCw className="size-3.5" /> Fetch ingredients
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line overflow-hidden">
            {dish.ingredients.map((ing) => (
              <li key={ing.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-surface text-sm">
                <span className={cx("min-w-0 truncate", ing.isPantryStaple && "text-muted")}>
                  {ing.name}
                  {ing.optional && <span className="text-muted text-xs"> (optional)</span>}
                </span>
                <span className="text-muted text-xs shrink-0 tabular-nums">
                  {ing.quantity ? `${Number(ing.quantity)} ${ing.unit}` : ing.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          Comments{comments.length > 0 && ` (${comments.length})`}
        </h3>

        {comments.length === 0 ? (
          <p className="text-sm text-muted py-2">
            Nothing yet. Say if you&apos;re not up for it, or ask for less mirchi.
          </p>
        ) : (
          <ul className="space-y-2.5 mb-3">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <Avatar emoji={c.emoji} name={c.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    <span className="font-medium text-ink">
                      {c.userId === user.id ? "You" : (c.name ?? "Someone")}
                    </span>{" "}
                    · {timeAgo(c.createdAt)}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={send} className="flex gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            maxLength={1000}
          />
          <Button type="submit" loading={sending} disabled={!body.trim()} className="px-3.5 shrink-0">
            <Send className="size-4" />
          </Button>
        </form>
      </section>

      <div className="flex gap-2 pt-1">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={async () => {
            setBusy(true);
            try {
              await api.patch(`/api/plan/${entry.id}`, {
                status: entry.status === "cooked" ? "proposed" : "cooked",
              });
              onChanged();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          <ChefHat className="size-4" />
          {entry.status === "cooked" ? "Not cooked" : "Mark cooked"}
        </Button>
        <Button variant="danger" onClick={removeEntry} disabled={busy}>
          <Trash2 className="size-4" /> Remove
        </Button>
      </div>
    </Sheet>
  );
}
