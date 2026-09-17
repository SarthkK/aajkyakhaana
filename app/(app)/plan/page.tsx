"use client";

import Link from "next/link";
import { ChevronRight, ShoppingCart } from "lucide-react";
import { useApi } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import { Card, ErrorNote, cx } from "@/components/ui";
import { PlanListSkeleton } from "@/components/Skeleton";
import { VegDot } from "@/components/EntryCard";
import { SLOTS, SLOT_LABELS, SLOT_EMOJI, friendlyDate, weekdayOf, addDays } from "@/lib/dates";
import type { PlanResponse } from "@/lib/types";

const DAYS_AHEAD = 13;

export default function PlanPage() {
  const { data, error, loading } = useApi<PlanResponse>(
    `/api/plan?from=${todayGuess()}&to=${addDays(todayGuess(), DAYS_AHEAD)}`,
  );

  const today = data?.today ?? todayGuess();
  const dates = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(today, i));

  return (
    <>
      <AppHeader
        title="The plan"
        subtitle="Next two weeks"
        action={
          <Link href="/shopping" className="p-2 text-muted" aria-label="Shopping list">
            <ShoppingCart className="size-5" />
          </Link>
        }
      />

      <div className="px-4 pt-4 space-y-2.5">
        {loading && !data && <PlanListSkeleton />}
        {error && !data && <ErrorNote>{error}</ErrorNote>}

        {data &&
          dates.map((date) => {
            const dayEntries = data.entries.filter((e) => e.date === date);
            const isToday = date === today;

            return (
              <Link key={date} href={`/day/${date}`} className="block">
                <Card
                  className={cx(
                    "p-4 active:bg-surface-2 transition",
                    isToday && "border-accent/40 bg-accent-soft/30",
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <h2 className="font-semibold">{friendlyDate(date, today)}</h2>
                      <span className="text-xs text-muted truncate">{weekdayOf(date)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {dayEntries.length > 0 && (
                        <span className="text-[11px] text-muted">{dayEntries.length} planned</span>
                      )}
                      <ChevronRight className="size-4 text-muted" />
                    </div>
                  </div>

                  {dayEntries.length === 0 ? (
                    <p className="text-sm text-muted">Nothing planned</p>
                  ) : (
                    <ul className="space-y-1">
                      {SLOTS.filter((slot) => dayEntries.some((e) => e.slot === slot)).map((slot) => (
                        <li key={slot} className="flex items-start gap-2 text-sm">
                          <span className="text-xs text-muted w-[68px] shrink-0 pt-0.5">
                            {SLOT_EMOJI[slot]} {SLOT_LABELS[slot]}
                          </span>
                          <span className="min-w-0 flex flex-wrap gap-x-2 gap-y-1">
                            {dayEntries
                              .filter((e) => e.slot === slot)
                              .map((e) => (
                                <span key={e.id} className="inline-flex items-center gap-1.5">
                                  <VegDot isVeg={e.dish.isVeg} />
                                  <span className={cx("truncate", e.status === "cancelled" && "line-through opacity-60")}>
                                    {e.dish.name}
                                  </span>
                                  {e.upVotes > 0 && <span className="text-[11px] text-good">+{e.upVotes}</span>}
                                  {e.downVotes > 0 && <span className="text-[11px] text-bad">−{e.downVotes}</span>}
                                </span>
                              ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </Link>
            );
          })}

        <div className="h-4" />
      </div>
    </>
  );
}

/** The server sends the real household date; this is only the first-render placeholder. */
function todayGuess() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
