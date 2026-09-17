"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { EntryCard } from "@/components/EntryCard";
import { AddMealSheet } from "@/components/AddMealSheet";
import { EntryDetailSheet } from "@/components/EntryDetailSheet";
import { SLOTS, SLOT_LABELS, SLOT_EMOJI, friendlyDate, weekdayOf, type Slot } from "@/lib/dates";
import { cx } from "@/components/ui";
import type { PlanEntryView } from "@/lib/types";

export function DayBoard({
  date,
  today,
  entries,
  onChanged,
  patchEntry,
  /** Snacks stay hidden until someone plans one — most flats do not use that slot. */
  slots = SLOTS,
  compact = false,
}: {
  date: string;
  today: string;
  entries: PlanEntryView[];
  onChanged: () => void;
  patchEntry: (id: string, patch: Partial<PlanEntryView>) => void;
  slots?: readonly Slot[];
  compact?: boolean;
}) {
  const [adding, setAdding] = useState<Slot | null>(null);
  const [open, setOpen] = useState<PlanEntryView | null>(null);

  const visibleSlots = slots.filter((s) => s !== "snack" || entries.some((e) => e.slot === "snack"));
  const label = friendlyDate(date, today);

  return (
    <section className={cx(compact ? "mb-5" : "mb-7")}>
      <div className="flex items-baseline justify-between px-1 mb-2.5">
        <h2 className="text-lg font-bold tracking-tight">{label}</h2>
        <span className="text-xs text-muted">
          {label === weekdayOf(date) ? "" : weekdayOf(date)}
        </span>
      </div>

      <div className="space-y-3">
        {visibleSlots.map((slot) => {
          const slotEntries = entries.filter((e) => e.slot === slot);
          return (
            <div key={slot} className="bg-surface-2/60 border border-line rounded-3xl p-2.5">
              <div className="flex items-center justify-between px-1.5 pb-2">
                <h3 className="text-[13px] font-semibold text-muted">
                  <span className="mr-1.5">{SLOT_EMOJI[slot]}</span>
                  {SLOT_LABELS[slot]}
                </h3>
                <button
                  onClick={() => setAdding(slot)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent-text px-2 py-1 -mr-1 rounded-lg active:bg-accent-soft"
                >
                  <Plus className="size-3.5" /> Add
                </button>
              </div>

              {slotEntries.length === 0 ? (
                <button
                  onClick={() => setAdding(slot)}
                  className="w-full text-left text-sm text-muted px-3.5 py-3 rounded-2xl border border-dashed border-line active:bg-surface"
                >
                  Nothing decided yet — tap to add
                </button>
              ) : (
                <div className="space-y-2">
                  {slotEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onOpen={() => setOpen(entry)}
                      onChanged={(patch) => patchEntry(entry.id, patch)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <AddMealSheet
          open
          slot={adding}
          date={date}
          onClose={() => setAdding(null)}
          onAdded={onChanged}
        />
      )}

      <EntryDetailSheet
        key={open?.id ?? "none"}
        entry={open ? (entries.find((e) => e.id === open.id) ?? open) : null}
        onClose={() => setOpen(null)}
        onChanged={onChanged}
      />
    </section>
  );
}
