"use client";

import { NUTRIENT_LABELS, NUTRIENT_UNITS, MACRO_KEYS, MICRO_KEYS } from "@/lib/nutrition";
import { cx } from "@/components/ui";
import type { Nutrition } from "@/lib/types";

function fmt(value: number, key: string) {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${NUTRIENT_UNITS[key] ?? ""}`;
}

export function NutritionChips({ nutrition, showMicros = false }: { nutrition: Nutrition | null; showMicros?: boolean }) {
  if (!nutrition || Object.keys(nutrition).length === 0) return null;
  const keys = showMicros ? [...MACRO_KEYS, ...MICRO_KEYS] : MACRO_KEYS;

  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => {
        const value = nutrition[key as keyof Nutrition] as number | undefined;
        if (typeof value !== "number") return null;
        return (
          <span key={key} className="text-[11px] px-2 py-1 rounded-lg bg-surface-2 border border-line">
            <span className="text-muted">{NUTRIENT_LABELS[key]} </span>
            <span className="font-semibold">{fmt(value, key)}</span>
          </span>
        );
      })}
    </div>
  );
}

/** A single target bar: green when comfortably met, amber when short, red when way off. */
export function CoverageBar({ label, pct, detail }: { label: string; pct: number; detail?: string }) {
  const tone = pct >= 85 ? "bg-good" : pct >= 55 ? "bg-accent" : "bg-bad";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums">
          {pct}%{detail && <span className="text-muted font-normal ml-1">{detail}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cx("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
