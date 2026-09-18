"use client";

import { useState } from "react";
import { Plus, Lock, ChefHat, CalendarPlus } from "lucide-react";
import { EntryCard } from "@/components/EntryCard";
import { AddMealSheet } from "@/components/AddMealSheet";
import { EntryDetailSheet } from "@/components/EntryDetailSheet";
import { SLOTS, SLOT_LABELS, SLOT_EMOJI, friendlyDate, weekdayOf, addDays, type Slot } from "@/lib/dates";
import { isSlotLocked, lockTimeFor, resolveSlot, isCookOff } from "@/lib/slots";
import { cx } from "@/components/ui";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client";
import type { PlanEntryView } from "@/lib/types";

export function DayBoard({
  date,
  today,
  entries,
  onChanged,
  patchEntry,
  slots = SLOTS,
  /** Today and tomorrow get the full treatment; further out is deliberately quieter. */
  size = "large",
}: {
  date: string;
  today: string;
  entries: PlanEntryView[];
  onChanged: () => void;
  patchEntry: (id: string, patch: Partial<PlanEntryView>) => void;
  slots?: readonly Slot[];
  size?: "large" | "compact";
}) {
  const { household } = useSession();
  const toast = useToast();
  const [adding, setAdding] = useState<Slot | null>(null);
  const [open, setOpen] = useState<PlanEntryView | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const visibleSlots = slots.filter((s) => s !== "snack" || entries.some((e) => e.slot === "snack"));
  const label = friendlyDate(date, today);
  const cookOff = isCookOff(date, household.cookOffDays);

  /** A dish that lost its slot is offered a new day rather than being deleted. */
  async function moveToTomorrow(entry: PlanEntryView) {
    setMoving(entry.id);
    try {
      const to = addDays(entry.date, 1);
      await api.patch(`/api/plan/${entry.id}`, { date: to });
      onChanged();
      toast(`${entry.dish.name} moved to ${friendlyDate(to, today).toLowerCase()}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not move it", { tone: "bad" });
    } finally {
      setMoving(null);
    }
  }

  return (
    <section className={size === "large" ? "mb-7" : "mb-4"}>
      <div className="flex items-baseline justify-between px-1 mb-2.5">
        <h2 className={cx("font-bold tracking-tight", size === "large" ? "text-lg" : "text-base")}>
          {label}
        </h2>
        <span className="text-xs text-muted">
          {cookOff ? "Cook's day off" : label === weekdayOf(date) ? "" : weekdayOf(date)}
        </span>
      </div>

      {cookOff && (
        <p className="text-xs text-muted bg-surface-2 border border-line rounded-2xl px-3.5 py-2.5 mb-3 leading-relaxed">
          🧑‍🍳 No cook today — order in, or pick something one of you can make.
        </p>
      )}

      <div className={size === "large" ? "space-y-3" : "space-y-2"}>
        {visibleSlots.map((slot) => {
          const slotEntries = entries.filter((e) => e.slot === slot);
          const locked = isSlotLocked(date, slot, household);
          const outcome = resolveSlot(slotEntries, { locked });

          return (
            <div
              key={slot}
              className={cx(
                "bg-surface-2/60 border border-line rounded-3xl",
                size === "large" ? "p-2.5" : "p-2",
              )}
            >
              <div className="flex items-center justify-between px-1.5 pb-2">
                <h3 className="text-[13px] font-semibold text-muted flex items-center gap-1.5">
                  <span>{SLOT_EMOJI[slot]}</span>
                  {SLOT_LABELS[slot]}
                  {outcome.contested && !locked && (
                    <span className="text-[11px] font-medium text-accent-text">
                      · {slotEntries.length} options, vote by {lockTimeFor(slot, household)}
                    </span>
                  )}
                  {locked && slotEntries.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                      <Lock className="size-3" /> settled
                    </span>
                  )}
                </h3>
                {!locked && (
                  <button
                    onClick={() => setAdding(slot)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent-text px-2 py-1 -mr-1 rounded-lg active:bg-accent-soft"
                  >
                    <Plus className="size-3.5" /> Add
                  </button>
                )}
              </div>

              {slotEntries.length === 0 ? (
                <button
                  onClick={() => !locked && setAdding(slot)}
                  disabled={locked}
                  className={cx(
                    "w-full text-left text-sm px-3.5 py-3 rounded-2xl border border-dashed border-line",
                    locked ? "text-muted/60 cursor-default" : "text-muted active:bg-surface",
                  )}
                >
                  {locked ? "Nothing was planned" : "Nothing decided yet — tap to add"}
                </button>
              ) : (
                <div className="space-y-2">
                  {[outcome.winner, ...outcome.runnersUp].filter(Boolean).map((entry) => {
                    const e = entry as PlanEntryView;
                    const leading = e.id === outcome.winner?.id;
                    return (
                      <div key={e.id}>
                        <EntryCard
                          entry={e}
                          onOpen={() => setOpen(e)}
                          onChanged={(patch) => patchEntry(e.id, patch)}
                          contested={outcome.contested}
                          leading={leading}
                          locked={locked}
                        />
                        {outcome.contested && !leading && !locked && (
                          <button
                            onClick={() => moveToTomorrow(e)}
                            disabled={moving === e.id}
                            className="mt-1 ml-1 inline-flex items-center gap-1 text-[11px] text-muted px-2 py-1 rounded-lg active:bg-surface disabled:opacity-50"
                          >
                            <CalendarPlus className="size-3" />
                            {moving === e.id ? "Moving…" : "Save it for tomorrow instead"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* The one line that matters once the argument is over. */}
              {locked && outcome.winner && outcome.contested && (
                <p className="text-[11px] text-muted px-1.5 pt-2 inline-flex items-center gap-1">
                  <ChefHat className="size-3" />
                  {household.cookName ? `${household.cookName} makes` : "Making"} {outcome.winner.dish.name}
                </p>
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
