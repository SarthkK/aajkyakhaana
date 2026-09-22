"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Sheet, Input, Button, Select, Field, ErrorNote } from "@/components/ui";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/shopping";

export type EditableItem = {
  id: string;
  name: string;
  /** The shopping list carries numerics back as strings; the pantry as numbers. */
  quantity: string | number | null;
  unit: string | null;
  category: string;
  note?: string | null;
};

/**
 * Correcting one line of the shopping list, or one shelf of the pantry.
 *
 * Both lists largely fill themselves — the list from the plan, the pantry from whatever
 * gets ticked off — and both are therefore wrong in small ways a person needs to be able
 * to put right: a name the model spelled oddly, an amount that is not what the packet
 * actually holds, a thing filed under the wrong aisle. Before this the only edit either
 * list allowed was deleting the row and typing it again.
 *
 * Shared by both so the two lists cannot drift apart; `fields` is what differs, since a
 * pantry shelf has no shop note.
 */
export function ItemEditSheet({
  item,
  title,
  units,
  showNote = false,
  onClose,
  onSave,
  onDelete,
}: {
  item: EditableItem | null;
  title: string;
  units: string[];
  showNote?: boolean;
  onClose: () => void;
  onSave: (patch: { name: string; quantity: number | null; unit: string | null; category: string; note?: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("other");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to the row being opened, not to whatever was typed into the last one.
  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQuantity(item.quantity != null ? String(Number(item.quantity)) : "");
    setUnit(item.unit ?? "");
    setCategory(item.category);
    setNote(item.note ?? "");
    setError(null);
  }, [item]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        quantity: quantity === "" ? null : Number(quantity),
        unit: unit || null,
        category,
        ...(showNote ? { note: note.trim() || null } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that");
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(item)} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
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
              {units.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Where it goes">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
        </Field>

        {showNote && (
          <Field label="Note" hint="Brand, ripeness, whatever the shop needs to know">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Amul taza" />
          </Field>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={remove} disabled={busy} className="shrink-0 px-4">
            <Trash2 className="size-4" />
          </Button>
          <Button type="submit" size="lg" className="flex-1" loading={busy} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
