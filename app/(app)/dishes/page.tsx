"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, AlertCircle, ChevronRight } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import { Button, Input, Field, Sheet, Loading, ErrorNote, EmptyState, Segmented, Card } from "@/components/ui";
import { VegDot } from "@/components/EntryCard";
import type { DishWithIngredients } from "@/lib/types";

const COURSES = [
  { value: "all", label: "All" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snacks" },
];

export default function DishesPage() {
  const { data, error, loading, reload } = useApi<{ dishes: DishWithIngredients[] }>("/api/dishes");
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [adding, setAdding] = useState(false);

  const dishes = useMemo(() => data?.dishes ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dishes.filter(
      (d) => (!q || d.name.toLowerCase().includes(q)) && (course === "all" || d.course === course),
    );
  }, [dishes, query, course]);

  return (
    <>
      <AppHeader
        title="Dishes"
        subtitle={`${dishes.length} saved for your flat`}
        action={
          <button onClick={() => setAdding(true)} className="p-2 text-accent" aria-label="Add dish">
            <Plus className="size-6" />
          </button>
        }
      />

      <div className="px-4 pt-4">
        <div className="relative mb-3">
          <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes…"
            className="pl-10"
          />
        </div>

        <div className="mb-4">
          <Segmented value={course} onChange={setCourse} options={COURSES} />
        </div>

        {loading && !data && <Loading />}
        {error && <ErrorNote>{error}</ErrorNote>}

        {data && filtered.length === 0 && (
          <EmptyState
            emoji="📖"
            title={query || course !== "all" ? "Nothing matches" : "Your dish book is empty"}
            body={
              query || course !== "all"
                ? "Try a different search."
                : "Add the things your cook already makes. Ingredients and nutrition get filled in for you."
            }
            action={
              !query && course === "all" ? (
                <Button onClick={() => setAdding(true)}>
                  <Plus className="size-4" /> Add a dish
                </Button>
              ) : undefined
            }
          />
        )}

        <ul className="space-y-2">
          {filtered.map((d) => (
            <li key={d.id}>
              <Link href={`/dishes/${d.id}`}>
                <Card className="p-3.5 flex items-center gap-3 active:bg-surface-2">
                  <VegDot isVeg={d.isVeg} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{d.name}</p>
                    <p className="text-xs text-muted truncate mt-0.5">
                      {d.enrichStatus === "pending" ? (
                        "Fetching ingredients…"
                      ) : d.enrichStatus === "failed" ? (
                        <span className="text-bad inline-flex items-center gap-1">
                          <AlertCircle className="size-3" /> Needs ingredients
                        </span>
                      ) : (
                        <>
                          {d.ingredients.length} ingredients
                          {d.nutrition?.calories ? ` · ${Math.round(d.nutrition.calories)} kcal` : ""}
                          {d.nutrition?.protein_g ? ` · ${Math.round(d.nutrition.protein_g)}g protein` : ""}
                        </>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted shrink-0" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>

        <div className="h-4" />
      </div>

      <AddDishSheet open={adding} onClose={() => setAdding(false)} onAdded={reload} />
    </>
  );
}

function AddDishSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [hint, setHint] = useState("");
  const [course, setCourse] = useState("any");
  const [servings, setServings] = useState("4");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus("Saving…");
    try {
      const res = await api.post<{ dish: DishWithIngredients }>("/api/dishes", {
        name,
        hint: hint || null,
        course,
        baseServings: Number(servings) || 4,
      });
      onAdded();

      setStatus("Looking up ingredients and nutrition…");
      let lookupFailed: string | null = null;
      try {
        await api.post(`/api/dishes/${res.dish.id}/enrich`);
      } catch (err) {
        // The dish is saved either way — the list shows it needs ingredients.
        lookupFailed = err instanceof Error ? err.message : "Ingredient lookup failed";
      }
      onAdded();

      setName("");
      setHint("");
      setStatus(null);
      setBusy(false);

      // Stay open when the lookup failed, so the message is actually read.
      if (lookupFailed) setError(`Saved “${res.dish.name}”, but: ${lookupFailed}`);
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a dish">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Dish name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rajma Chawal"
            required
            autoFocus
          />
        </Field>

        <Field label="Anything specific?" hint="Optional. E.g. 'the way mum makes it, less oil'.">
          <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional" />
        </Field>

        <Field label="Usually eaten at">
          <Segmented
            value={course}
            onChange={setCourse}
            options={[
              { value: "any", label: "Any time" },
              { value: "breakfast", label: "Breakfast" },
              { value: "lunch", label: "Lunch" },
              { value: "dinner", label: "Dinner" },
              { value: "snack", label: "Snack" },
            ]}
          />
        </Field>

        <Field label="Cooked for how many?" hint="Ingredient quantities are scaled to this.">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </Field>

        {status && <p className="text-sm text-muted">{status}</p>}
        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Add dish
        </Button>
      </form>
    </Sheet>
  );
}
