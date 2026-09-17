"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Trash2, Check } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import { Button, Input, Field, Select, Segmented, ErrorNote, Card, cx } from "@/components/ui";
import { DishEditorSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { NutritionChips } from "@/components/Nutrition";
import { MACRO_KEYS, NUTRIENT_LABELS, NUTRIENT_UNITS } from "@/lib/nutrition";
import type { DishWithIngredients, Ingredient, Nutrition } from "@/lib/types";

const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch", "bunch", "to taste"];
const CATEGORIES = ["produce", "dairy", "grains", "pulses", "spices", "meat", "other"];

type EditableIngredient = {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  optional: boolean;
  isPantryStaple: boolean;
};

function toEditable(list: Ingredient[]): EditableIngredient[] {
  return list.map((i) => ({
    name: i.name,
    quantity: i.quantity != null ? String(Number(i.quantity)) : "",
    unit: i.unit,
    category: i.category,
    optional: i.optional,
    isPantryStaple: i.isPantryStaple,
  }));
}

export default function DishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<{ dish: DishWithIngredients }>(`/api/dishes/${id}`);
  // Bumped after an AI refetch so the editor remounts with the new values.
  const [formVersion, setFormVersion] = useState(0);

  if (loading && !data) {
    return (
      <>
        <AppHeader title="Dish" back="/dishes" />
        <div className="px-4 pt-4">
          <DishEditorSkeleton />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <AppHeader title="Dish" back="/dishes" />
        <div className="p-4">
          <ErrorNote>{error ?? "Not found"}</ErrorNote>
        </div>
      </>
    );
  }

  return (
    <DishEditor
      key={`${data.dish.id}-${formVersion}`}
      dish={data.dish}
      reload={reload}
      onRefetched={() => setFormVersion((v) => v + 1)}
    />
  );
}

function DishEditor({
  dish,
  reload,
  onRefetched,
}: {
  dish: DishWithIngredients;
  reload: () => Promise<void>;
  onRefetched: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  // Seeded from the server copy once; the remount key above handles refreshes.
  const [name, setName] = useState(dish.name);
  const [course, setCourse] = useState(dish.course);
  const [isVeg, setIsVeg] = useState(dish.isVeg);
  const [servings, setServings] = useState(String(dish.baseServings));
  const [ingredients, setIngredients] = useState<EditableIngredient[]>(() => toEditable(dish.ingredients));
  const [nutrition, setNutrition] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      MACRO_KEYS.map((k) => [k, dish.nutrition?.[k] != null ? String(Math.round(dish.nutrition[k]!)) : ""]),
    ),
  );

  const [saving, setSaving] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setProblem(null);
    try {
      const macros: Nutrition = { ...(dish.nutrition ?? {}) };
      for (const key of MACRO_KEYS) {
        const raw = nutrition[key];
        if (raw === "" || raw == null) delete macros[key];
        else macros[key] = Number(raw);
      }

      await api.patch(`/api/dishes/${dish.id}`, {
        name,
        course,
        isVeg,
        baseServings: Number(servings) || 4,
        nutrition: macros,
      });

      await api.put(`/api/dishes/${dish.id}/ingredients`, {
        ingredients: ingredients
          .filter((i) => i.name.trim())
          .map((i) => ({
            name: i.name.trim(),
            quantity: i.quantity === "" ? null : Number(i.quantity),
            unit: i.unit,
            category: i.category,
            optional: i.optional,
            isPantryStaple: i.isPantryStaple,
          })),
      });

      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast(`Saved ${name}`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
      toast("Could not save that", { tone: "bad" });
    } finally {
      setSaving(false);
    }
  }

  async function refetch() {
    setRefetching(true);
    setProblem(null);
    try {
      await api.post(`/api/dishes/${dish.id}/enrich`);
      await reload();
      onRefetched();
      toast(`Fetched ${dish.name} again`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Lookup failed");
      toast(err instanceof Error ? err.message : "Lookup failed", { tone: "bad" });
    } finally {
      setRefetching(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove "${name}" from your flat's dish book?`)) return;
    await api.del(`/api/dishes/${dish.id}`);
    router.replace("/dishes");
  }

  return (
    <>
      <AppHeader
        title={dish.name}
        back="/dishes"
        action={
          <Button size="sm" onClick={save} loading={saving} className="shrink-0">
            {saved ? <Check className="size-4" /> : null}
            {saved ? "Saved" : "Save"}
          </Button>
        }
      />

      <div className="px-4 pt-4 space-y-5">
        {problem && <ErrorNote>{problem}</ErrorNote>}

        <Card className="p-4 space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cooked for">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </Field>
            <Field label="Type">
              <Segmented
                value={isVeg ? "veg" : "nonveg"}
                onChange={(v) => setIsVeg(v === "veg")}
                options={[
                  { value: "veg", label: "Veg" },
                  { value: "nonveg", label: "Non-veg" },
                ]}
              />
            </Field>
          </div>

          {dish.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dish.tags.map((t) => (
                <span key={t} className="text-[11px] px-2 py-1 rounded-lg bg-surface-2 border border-line text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}
        </Card>

        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
              Ingredients for {servings || "?"}
            </h2>
            <Button size="sm" variant="ghost" onClick={refetch} loading={refetching}>
              <RefreshCw className="size-3.5" /> Refetch
            </Button>
          </div>

          {dish.enrichStatus === "failed" && dish.enrichError && (
            <p className="text-xs text-muted mb-2 px-1">{dish.enrichError}</p>
          )}

          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <Card key={idx} className="p-3">
                <div className="flex gap-2 mb-2">
                  <Input
                    value={ing.name}
                    onChange={(e) =>
                      setIngredients((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                    }
                    placeholder="Ingredient"
                    className="flex-1 py-2"
                  />
                  <button
                    onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}
                    className="px-2 text-muted shrink-0"
                    aria-label="Remove ingredient"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={ing.quantity}
                    onChange={(e) =>
                      setIngredients((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                    }
                    placeholder="Qty"
                    className="w-20 py-2 px-3"
                  />
                  <Select
                    value={ing.unit}
                    onChange={(e) =>
                      setIngredients((prev) => prev.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))
                    }
                    className="w-24 py-2 px-3"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </Select>
                  <Select
                    value={ing.category}
                    onChange={(e) =>
                      setIngredients((prev) => prev.map((x, i) => (i === idx ? { ...x, category: e.target.value } : x)))
                    }
                    className="flex-1 py-2 px-3"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </div>

                <div className="flex gap-2 mt-2">
                  <Toggle
                    on={ing.isPantryStaple}
                    onClick={() =>
                      setIngredients((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, isPantryStaple: !x.isPantryStaple } : x)),
                      )
                    }
                    label="Already at home"
                  />
                  <Toggle
                    on={ing.optional}
                    onClick={() =>
                      setIngredients((prev) => prev.map((x, i) => (i === idx ? { ...x, optional: !x.optional } : x)))
                    }
                    label="Optional"
                  />
                </div>
              </Card>
            ))}
          </div>

          <Button
            variant="secondary"
            className="w-full mt-2"
            onClick={() =>
              setIngredients((prev) => [
                ...prev,
                { name: "", quantity: "", unit: "g", category: "other", optional: false, isPantryStaple: false },
              ])
            }
          >
            <Plus className="size-4" /> Add ingredient
          </Button>

          <p className="text-xs text-muted mt-2 px-1 leading-relaxed">
            Things marked “already at home” and “optional” are left off the shopping list.
          </p>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted px-1 mb-2">
            Nutrition per serving
          </h2>
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {MACRO_KEYS.map((key) => (
                <Field key={key} label={`${NUTRIENT_LABELS[key]} (${NUTRIENT_UNITS[key]})`}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={nutrition[key] ?? ""}
                    onChange={(e) => setNutrition((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="py-2"
                    placeholder="—"
                  />
                </Field>
              ))}
            </div>

            {dish.nutrition && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-xs text-muted mb-2">Micronutrients, estimated by AI</p>
                <NutritionChips nutrition={dish.nutrition} showMicros />
              </div>
            )}
          </Card>
        </section>

        <Button variant="danger" className="w-full" onClick={remove}>
          <Trash2 className="size-4" /> Delete dish
        </Button>

        <div className="h-4" />
      </div>
    </>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "text-xs px-2.5 h-8 rounded-full border font-medium transition",
        on ? "bg-accent-soft border-accent/40 text-accent-text" : "bg-surface-2 border-line text-muted",
      )}
    >
      {label}
    </button>
  );
}
