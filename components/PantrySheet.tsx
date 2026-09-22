"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Boxes, Pencil } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Sheet, Input, Button, Select, EmptyState, cx } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/shopping";
import { ItemEditSheet } from "@/components/ItemEditSheet";

type PantryRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  source: string;
};

/**
 * What the flat already has.
 *
 * Mostly fills itself: ticking something off the shopping list puts it here, and
 * cooking a meal takes it back out. The editing below is for the gap between what the
 * app thinks is in the cupboard and what is actually in it.
 */
export function PantrySheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: PantryRow[] }>(open ? "/api/pantry" : null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("g");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PantryRow | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);

  const grouped = useMemo(() => {
    const map = new Map<string, PantryRow[]>();
    for (const item of items) {
      const key = CATEGORY_LABELS[item.category] ? item.category : "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, rows: map.get(c)! }));
  }, [items]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/pantry", {
        name: name.trim(),
        quantity: quantity === "" ? null : Number(quantity),
        unit,
      });
      setName("");
      setQuantity("");
      await reload();
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that", { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(patch: { name: string; quantity: number | null; unit: string | null; category: string }) {
    if (!editing) return;
    await api.patch(`/api/pantry/${editing.id}`, patch);
    await reload();
    onChanged();
  }

  async function remove(item: PantryRow) {
    try {
      await api.del(`/api/pantry/${item.id}`);
      await reload();
      onChanged();
      toast(`Used up ${item.name}`, { tone: "info" });
    } catch {
      toast("Could not remove that", { tone: "bad" });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="What's in the kitchen">
      <p className="text-sm text-muted leading-relaxed mb-4">
        Anything you tick off the shopping list lands here, and cooking a meal takes it
        back out. The list only asks for what this does not already cover.
      </p>

      {/* Name on its own line: four controls in one row squeezed it to a few pixels on a
          phone, which is every device this is used on. */}
      <form onSubmit={add} className="space-y-2 mb-5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rajma" />
        {/* A grid, not flex with widths: Input and Select both carry w-full in their base
            class, which beats any width set here — Tailwind orders those by utility, not
            by the order they appear in the string. Sizing the cell sidesteps it. */}
        <div className="grid grid-cols-[1fr_6.5rem_auto] gap-2">
          <Input
            type="number"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="500"
          />
          <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="px-3">
            {["g", "kg", "ml", "l", "piece"].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
          <Button type="submit" loading={busy} disabled={!name.trim()} className="px-4">
            <Plus className="size-4" />
          </Button>
        </div>
      </form>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-2xl" />)}
        </div>
      )}

      {data && items.length === 0 && (
        <EmptyState
          emoji="🧺"
          title="Nothing recorded yet"
          body="Tick something off the shopping list and it will show up here automatically."
        />
      )}

      <div className="space-y-5">
        {grouped.map(({ category, rows }) => (
          <section key={category}>
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted px-1 mb-2">
              {CATEGORY_LABELS[category]}
            </h3>
            <ul className="rounded-3xl border border-line overflow-hidden divide-y divide-line">
              {rows.map((item) => (
                <li key={item.id} className="flex items-center gap-3 bg-surface px-3.5 py-2.5">
                  <button onClick={() => setEditing(item)} className="min-w-0 flex-1 text-left">
                    <span className="block text-sm truncate">{item.name}</span>
                    <span className="block text-xs text-muted">
                      {item.quantity != null ? `${item.quantity} ${item.unit ?? ""}` : "some"}
                      {item.source === "bought" ? " · bought" : " · added by hand"}
                    </span>
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="p-2 text-muted shrink-0"
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => remove(item)}
                    className="p-2 -mr-1 text-muted shrink-0"
                    aria-label={`Used up ${item.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <ItemEditSheet
        item={editing}
        title="Fix this shelf"
        units={["g", "kg", "ml", "l", "piece"]}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
        onDelete={async () => {
          if (editing) await remove(editing);
        }}
      />

      <div className={cx("flex items-center gap-2 text-xs text-muted mt-5 px-1")}>
        <Boxes className="size-3.5 shrink-0" />
        <span>Everyday masalas are assumed to be here already and never appear on the list.</span>
      </div>
    </Sheet>
  );
}
