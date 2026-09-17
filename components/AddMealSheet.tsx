"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Sparkles, Clock } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Sheet, Input, Button, Loading, ErrorNote, cx } from "@/components/ui";
import { VegDot } from "@/components/EntryCard";
import { SLOT_LABELS, type Slot } from "@/lib/dates";
import type { DishWithIngredients, SuggestionView } from "@/lib/types";

export function AddMealSheet({
  open,
  onClose,
  date,
  slot,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  slot: Slot;
  onAdded: () => void;
}) {
  const { data, loading } = useApi<{ dishes: DishWithIngredients[] }>(open ? "/api/dishes" : null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<SuggestionView[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const dishes = useMemo(() => data?.dishes ?? [], [data]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored = dishes.filter((d) => !q || d.name.toLowerCase().includes(q));
    // Dishes meant for this slot float to the top.
    return scored.sort((a, b) => {
      const aFit = a.course === slot ? 0 : 1;
      const bFit = b.course === slot ? 0 : 1;
      return aFit - bFit;
    });
  }, [dishes, query, slot]);

  const exactMatch = dishes.some((d) => d.name.toLowerCase() === query.trim().toLowerCase());

  function reset() {
    setQuery("");
    setError(null);
    setSuggestions(null);
    setBusyId(null);
  }

  async function add(body: Record<string, unknown>, key: string) {
    setBusyId(key);
    setError(null);
    try {
      const res = await api.post<{ entry: { id: string }; createdDish: { id: string } | null }>("/api/plan", {
        date,
        slot,
        ...body,
      });
      // A brand new dish has no ingredients yet — look them up in the background.
      if (res.createdDish) {
        void api.post(`/api/dishes/${res.createdDish.id}/enrich`).then(onAdded).catch(() => {});
      }
      onAdded();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that");
      setBusyId(null);
    }
  }

  async function askAi() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await api.post<{ suggestions: SuggestionView[] }>("/api/ai/suggest", { date, slot });
      setSuggestions(res.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Add to ${SLOT_LABELS[slot].toLowerCase()}`}
    >
      <div className="relative mb-3">
        <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or type a new dish…"
          className="pl-10"
          autoFocus
        />
      </div>

      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      {query.trim() && !exactMatch && (
        <button
          onClick={() => add({ dishName: query.trim() }, "new")}
          disabled={busyId !== null}
          className="w-full flex items-center gap-3 p-3.5 mb-3 rounded-2xl bg-accent-soft border border-accent/30 text-left disabled:opacity-60"
        >
          <span className="size-9 rounded-full bg-accent text-white grid place-items-center shrink-0">
            <Plus className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium truncate">Add “{query.trim()}”</span>
            <span className="block text-xs text-muted">
              {busyId === "new" ? "Adding and looking up ingredients…" : "New dish — ingredients fetched automatically"}
            </span>
          </span>
        </button>
      )}

      {!query.trim() && (
        <Button
          variant="secondary"
          className="w-full mb-3"
          onClick={askAi}
          loading={suggesting}
        >
          <Sparkles className="size-4 text-accent" />
          {suggestions ? "Suggest something else" : "Can't decide? Ask AI"}
        </Button>
      )}

      {suggestions && (
        <div className="space-y-2 mb-4">
          {suggestions.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              onClick={() =>
                add(
                  s.existing_dish_id ? { dishId: s.existing_dish_id, suggested: true } : { dishName: s.name, suggested: true },
                  `sug-${i}`,
                )
              }
              disabled={busyId !== null}
              className="w-full text-left p-3.5 rounded-2xl bg-surface border border-line active:bg-surface-2 disabled:opacity-60"
            >
              <div className="flex items-center gap-2">
                <VegDot isVeg={s.is_veg} />
                <span className="font-medium">{s.name}</span>
                <span className="ml-auto text-[11px] text-muted inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {s.effort}
                </span>
              </div>
              <p className="text-xs text-muted mt-1.5 leading-relaxed">{s.reason}</p>
              {s.nutrition_note && (
                <p className="text-xs text-accent-text mt-1 leading-relaxed">{s.nutrition_note}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Loading label="Loading your dishes…" />
      ) : matches.length === 0 ? (
        !query.trim() && (
          <p className="text-sm text-muted text-center py-6 leading-relaxed">
            Nothing saved yet. Type a dish above and it will be added to your flat&apos;s library.
          </p>
        )
      ) : (
        <ul className="space-y-1.5">
          {matches.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => add({ dishId: d.id }, d.id)}
                disabled={busyId !== null}
                className={cx(
                  "w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border border-line bg-surface text-left active:bg-surface-2 disabled:opacity-60",
                )}
              >
                <VegDot isVeg={d.isVeg} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">{d.name}</span>
                  <span className="block text-xs text-muted truncate">
                    {d.nutrition?.calories ? `${Math.round(d.nutrition.calories)} kcal · ` : ""}
                    {d.nutrition?.protein_g ? `${Math.round(d.nutrition.protein_g)}g protein · ` : ""}
                    {d.ingredients.length
                      ? `${d.ingredients.length} ingredients`
                      : d.enrichStatus === "failed"
                        ? "Ingredients not fetched"
                        : "Fetching ingredients…"}
                  </span>
                </span>
                <Plus className="size-4 text-muted shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
