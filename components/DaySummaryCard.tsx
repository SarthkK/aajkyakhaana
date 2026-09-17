"use client";

import { useState } from "react";
import { ChevronDown, TrendingDown } from "lucide-react";
import { useApi } from "@/lib/client";
import { Card, cx, Spinner } from "@/components/ui";
import { CoverageBar, NutritionChips } from "@/components/Nutrition";
import { useSession } from "@/components/SessionProvider";
import { NUTRIENT_LABELS, NUTRIENT_UNITS, MACRO_KEYS } from "@/lib/nutrition";
import type { DaySummaryView } from "@/lib/types";

/** What the day's plan adds up to for the person looking at it. */
export function DaySummaryCard({ date }: { date: string }) {
  const { user } = useSession();
  const { data, loading } = useApi<DaySummaryView>(`/api/nutrition?date=${date}`);
  const [expanded, setExpanded] = useState(false);

  if (loading && !data) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted">
        <Spinner /> Working out the numbers…
      </Card>
    );
  }
  if (!data || data.dishCount === 0) return null;

  const me = data.members.find((m) => m.userId === user.id);

  if (!me?.targets) {
    return (
      <Card className="p-4">
        <p className="text-sm font-medium mb-1.5">Today adds up to, per person</p>
        <NutritionChips nutrition={data.perPerson} />
        <p className="text-xs text-muted mt-2.5 leading-relaxed">
          Add your age, height and weight on the Me tab to see how this compares to what you actually need.
        </p>
      </Card>
    );
  }

  const coverage = me.coverage ?? {};

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Your day, if you eat one serving of each</p>
            <p className="text-xs text-muted mt-0.5">
              {Math.round(data.perPerson.calories ?? 0)} of {me.targets.calories} kcal
              {" · "}
              {Math.round(data.perPerson.protein_g ?? 0)}g of {me.targets.protein_g}g protein
            </p>
          </div>
          <ChevronDown className={cx("size-5 text-muted shrink-0 transition", expanded && "rotate-180")} />
        </div>

        <div className="mt-3 space-y-2.5">
          {MACRO_KEYS.slice(0, expanded ? 5 : 2).map((key) => (
            <CoverageBar
              key={key}
              label={NUTRIENT_LABELS[key]}
              pct={coverage[key] ?? 0}
              detail={`${Math.round((data.perPerson[key] ?? 0) as number)}/${me.targets![key]}${NUTRIENT_UNITS[key]}`}
            />
          ))}
        </div>
      </button>

      {expanded && data.gaps.length > 0 && (
        <div className="px-4 pb-4 -mt-1">
          <div className="rounded-2xl bg-surface-2 p-3.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 inline-flex items-center gap-1.5">
              <TrendingDown className="size-3.5" /> Running short on
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.gaps.slice(0, 6).map((g) => (
                <span key={g.nutrient} className="text-[11px] px-2 py-1 rounded-lg bg-surface border border-line">
                  {g.label} <span className="font-semibold text-bad">{g.pctOfTarget}%</span>
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-2.5 leading-relaxed">
              Averaged across everyone who has filled in their details. The AI suggestions take these into account.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
