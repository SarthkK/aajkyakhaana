"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, Trash2, Check, Eraser } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import { Button, Input, Sheet, Field, Select, ErrorNote, EmptyState, cx } from "@/components/ui";
import { ShoppingListSkeleton } from "@/components/Skeleton";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/shopping";
import { addDays, todayIn } from "@/lib/dates";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import type { ShoppingItemView } from "@/lib/types";

export default function ShoppingPage() {
  const { household } = useSession();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<{ items: ShoppingItemView[] }>("/api/shopping");
  const [quick, setQuick] = useState("");
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);

  const items = data?.items ?? [];
  const pending = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  const grouped = useMemo(() => {
    const map = new Map<string, ShoppingItemView[]>();
    for (const item of pending) {
      const key = CATEGORY_LABELS[item.category] ? item.category : "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [pending]);

  async function toggle(item: ShoppingItemView) {
    // Ticking things off while standing in a shop must feel instant.
    setData((prev) =>
      prev
        ? { items: prev.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)) }
        : prev,
    );
    try {
      await api.patch(`/api/shopping/${item.id}`, { checked: !item.checked });
    } catch {
      toast("That did not save — check your connection", { tone: "bad" });
      void reload();
    }
  }

  async function remove(item: ShoppingItemView) {
    setData((prev) => (prev ? { items: prev.items.filter((i) => i.id !== item.id) } : prev));
    try {
      await api.del(`/api/shopping/${item.id}`);
      toast(`Removed ${item.name}`, {
        tone: "info",
        action: {
          label: "Undo",
          onClick: () => {
            void api
              .post("/api/shopping", {
                name: item.name,
                quantity: item.quantity != null ? Number(item.quantity) : null,
                unit: item.unit,
                category: item.category,
              })
              .then(reload)
              .catch(() => toast("Could not put it back", { tone: "bad" }));
          },
        },
      });
    } catch {
      toast("Could not remove that", { tone: "bad" });
      void reload();
    }
  }

  async function addQuick(e: React.FormEvent) {
    e.preventDefault();
    if (!quick.trim()) return;
    const name = quick.trim();
    setQuick("");
    try {
      await api.post("/api/shopping", { name });
      await reload();
      toast(`${name} added to the list`);
    } catch (err) {
      setQuick(name); // put it back so the typing is not lost
      toast(err instanceof Error ? err.message : "Could not add that", { tone: "bad" });
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const today = todayIn(household.timezone);
      const res = await api.post<{ added: number; skipped: number; message?: string }>("/api/shopping/generate", {
        from: today,
        to: addDays(today, 6),
      });
      await reload();
      toast(
        res.message ??
          (res.added === 0
            ? "Everything planned this week is already on the list"
            : `Added ${res.added} thing${res.added === 1 ? "" : "s"} from this week's plan`),
        { tone: res.added === 0 ? "info" : "good" },
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not build the list", { tone: "bad" });
    } finally {
      setGenerating(false);
    }
  }

  async function clearDone() {
    const count = done.length;
    await api.post("/api/shopping/clear");
    await reload();
    toast(`Cleared ${count} bought item${count === 1 ? "" : "s"}`, { tone: "info" });
  }

  return (
    <>
      <AppHeader
        title="Shopping list"
        subtitle={pending.length ? `${pending.length} to buy` : "All done"}
        action={
          <button onClick={() => setAdding(true)} className="p-2 text-accent" aria-label="Add item">
            <Plus className="size-6" />
          </button>
        }
      />

      <div className="px-4 pt-4">
        <form onSubmit={addQuick} className="flex gap-2 mb-3">
          <Input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Add something quickly…"
          />
          <Button type="submit" disabled={!quick.trim()} className="px-4 shrink-0">
            <Plus className="size-4" />
          </Button>
        </form>

        <Button variant="secondary" className="w-full mb-4" onClick={generate} loading={generating}>
          <Sparkles className="size-4 text-accent" /> Build from this week&apos;s plan
        </Button>

        {loading && !data && <ShoppingListSkeleton />}
        {error && !data && <ErrorNote>{error}</ErrorNote>}

        {data && pending.length === 0 && done.length === 0 && (
          <EmptyState
            emoji="🛒"
            title="Nothing on the list"
            body="Add things by hand, or build the list from whatever your flat has planned this week."
          />
        )}

        <div className="space-y-5">
          {grouped.map(({ category, items: groupItems }) => (
            <section key={category}>
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted px-1 mb-2">
                {CATEGORY_LABELS[category]}
              </h2>
              <ul className="rounded-3xl border border-line overflow-hidden divide-y divide-line">
                {groupItems.map((item) => (
                  <Row key={item.id} item={item} onToggle={() => toggle(item)} onRemove={() => remove(item)} />
                ))}
              </ul>
            </section>
          ))}

          {done.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                  In the bag ({done.length})
                </h2>
                <button onClick={clearDone} className="text-xs text-muted inline-flex items-center gap-1 px-2 py-1">
                  <Eraser className="size-3.5" /> Clear
                </button>
              </div>
              <ul className="rounded-3xl border border-line overflow-hidden divide-y divide-line opacity-60">
                {done.map((item) => (
                  <Row key={item.id} item={item} onToggle={() => toggle(item)} onRemove={() => remove(item)} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="h-6" />
      </div>

      <AddItemSheet open={adding} onClose={() => setAdding(false)} onAdded={reload} />
    </>
  );
}

function Row({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItemView;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const qty = item.quantity ? `${Number(item.quantity)}${item.unit ? ` ${item.unit}` : ""}` : null;

  return (
    <li className="flex items-center gap-3 bg-surface px-3.5 py-3">
      <button
        onClick={onToggle}
        aria-label={item.checked ? "Mark as not bought" : "Mark as bought"}
        className={cx(
          "size-6 rounded-full border-2 grid place-items-center shrink-0 transition",
          item.checked ? "bg-good border-good text-white" : "border-line",
        )}
      >
        {item.checked && <Check className="size-3.5" strokeWidth={3} />}
      </button>

      <button onClick={onToggle} className="flex-1 min-w-0 text-left">
        <span className={cx("block truncate", item.checked && "line-through text-muted")}>{item.name}</span>
        <span className="block text-xs text-muted truncate">
          {qty}
          {item.note ? ` ${item.note}` : ""}
          {qty && (item.source === "plan" || item.addedByName) ? " · " : ""}
          {item.source === "plan" ? "from the plan" : item.addedByName ? `${item.addedByName.split(" ")[0]} added` : ""}
        </span>
      </button>

      <button onClick={onRemove} className="p-2 -mr-2 text-muted shrink-0" aria-label="Remove">
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function AddItemSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/shopping", {
        name,
        quantity: quantity === "" ? null : Number(quantity),
        unit: unit || null,
        category,
      });
      setName("");
      setQuantity("");
      setUnit("");
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add to the list">
      <form onSubmit={submit} className="space-y-4">
        <Field label="What do you need?">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Doodh, Amul taza" required autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="How much">
            <Input
              type="number"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label="Unit">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">—</option>
              {["g", "kg", "ml", "l", "piece", "packet", "bunch", "dozen"].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Where in the shop">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Add to list
        </Button>
      </form>
    </Sheet>
  );
}
