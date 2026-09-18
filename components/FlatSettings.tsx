"use client";

import { useState } from "react";
import { Clock, CalendarX } from "lucide-react";
import { api } from "@/lib/client";
import { Card, Input, cx } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { HouseholdInfo } from "@/lib/types";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const SLOT_FIELDS = [
  { key: "breakfastLockAt", label: "Breakfast" },
  { key: "lunchLockAt", label: "Lunch" },
  { key: "dinnerLockAt", label: "Dinner" },
] as const;

/**
 * The two things about a flat that are really about the cook: when each meal has to be
 * decided by, and which days they do not come.
 */
export function FlatSettings({ household }: { household: HouseholdInfo }) {
  const toast = useToast();
  const [locks, setLocks] = useState({
    breakfastLockAt: household.breakfastLockAt,
    lunchLockAt: household.lunchLockAt,
    dinnerLockAt: household.dinnerLockAt,
  });
  const [offDays, setOffDays] = useState<number[]>(household.cookOffDays ?? []);

  async function save(patch: Record<string, unknown>, message: string) {
    try {
      await api.patch("/api/households", patch);
      toast(message);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save", { tone: "bad" });
    }
  }

  function toggleDay(day: number) {
    const next = offDays.includes(day) ? offDays.filter((d) => d !== day) : [...offDays, day].sort();
    setOffDays(next);
    void save(
      { cookOffDays: next },
      next.length === 0 ? "Cook comes every day" : `Cook's off on ${next.map((d) => DAYS[d].label).join(", ")}`,
    );
  }

  return (
    <Card className="p-4 space-y-5">
      <div>
        <p className="font-medium text-sm flex items-center gap-1.5 mb-1">
          <Clock className="size-4 text-muted" /> When each meal is settled
        </p>
        <p className="text-xs text-muted leading-relaxed mb-3">
          After this time the meal stops taking votes and whichever dish is ahead is the
          one being made. Set it a little before {household.cookName ?? "your cook"} arrives.
        </p>
        {/* Stacked rather than three across: a native time input with an AM/PM
            segment does not fit in a third of a phone's width. */}
        <div className="divide-y divide-line rounded-2xl border border-line overflow-hidden">
          {SLOT_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-surface">
              <span className="text-sm">{label}</span>
              <Input
                type="time"
                value={locks[key]}
                onChange={(e) => setLocks((prev) => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => void save({ [key]: locks[key] }, `${label} settles at ${locks[key]}`)}
                className="w-auto py-1.5 px-3 text-center"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="font-medium text-sm flex items-center gap-1.5 mb-1">
          <CalendarX className="size-4 text-muted" /> Cook&apos;s days off
        </p>
        <p className="text-xs text-muted leading-relaxed mb-3">
          Those days say so on the plan, so nobody waits for food that was never coming.
        </p>
        <div className="flex gap-1.5">
          {DAYS.map((day) => {
            const off = offDays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                aria-pressed={off}
                className={cx(
                  "flex-1 h-10 rounded-xl text-xs font-medium border pressable",
                  off
                    ? "bg-accent-soft border-accent/40 text-accent-text"
                    : "bg-surface-2 border-line text-muted",
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
