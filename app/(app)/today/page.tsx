"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, BookOpen } from "lucide-react";
import { useApi } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import { DayBoard } from "@/components/DayBoard";
import { DaySummaryCard } from "@/components/DaySummaryCard";
import { CookBriefing } from "@/components/CookBriefing";
import { DayBoardSkeleton, SummaryCardSkeleton } from "@/components/Skeleton";
import { ErrorNote, Card, cx } from "@/components/ui";
import { useSession } from "@/components/SessionProvider";
import { addDays, friendlyDate, weekdayOf, SLOTS, SLOT_EMOJI } from "@/lib/dates";
import type { PlanResponse, PlanEntryView } from "@/lib/types";

/** How many days past tomorrow to show as a quick glance. */
const PEEK_DAYS = 4;

export default function TodayPage() {
  const { household } = useSession();
  const [version, setVersion] = useState(0);
  const { data, error, loading, reload, setData } = useApi<PlanResponse>("/api/plan");

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    void reload();
  }, [reload]);

  // Vote taps update in place so the whole list does not flicker.
  const patchEntry = useCallback(
    (id: string, patch: Partial<PlanEntryView>) => {
      setData((prev) =>
        prev ? { ...prev, entries: prev.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : prev,
      );
    },
    [setData],
  );

  const today = data?.today;
  const tomorrow = today ? addDays(today, 1) : null;

  return (
    <>
      <AppHeader
        title={household.name}
        subtitle={household.cookName ? `Cook: ${household.cookName}` : "Kya khaana hai aaj?"}
        action={
          <div className="flex items-center -mr-2">
            <Link href="/dishes" className="p-2 text-muted" aria-label="Dish library">
              <BookOpen className="size-5" />
            </Link>
            <Link href="/plan" className="p-2 text-muted" aria-label="Full plan">
              <CalendarDays className="size-5" />
            </Link>
          </div>
        }
      />

      <div className="px-4 pt-4">
        {loading && !data && (
          <>
            <div className="mb-4">
              <SummaryCardSkeleton />
            </div>
            <DayBoardSkeleton filledSlots={2} />
            <DayBoardSkeleton filledSlots={0} />
          </>
        )}
        {error && !data && <ErrorNote>{error}</ErrorNote>}

        {data && today && tomorrow && (
          <>
            <div className="mb-4 space-y-3">
              <DaySummaryCard key={`${today}-${version}`} date={today} />
              <CookBriefing date={today} entries={data.entries.filter((e) => e.date === today)} />
            </div>

            <DayBoard
              date={today}
              today={today}
              entries={data.entries.filter((e) => e.date === today)}
              onChanged={refresh}
              patchEntry={patchEntry}
            />

            <DayBoard
              date={tomorrow}
              today={today}
              entries={data.entries.filter((e) => e.date === tomorrow)}
              onChanged={refresh}
              patchEntry={patchEntry}
            />

            {/* Further out is a glance, not a workspace — most flats decide day-of. */}
            <section className="mb-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted px-1 mb-2">
                Later this week
              </h2>
              <div className="space-y-1.5">
                {Array.from({ length: PEEK_DAYS }, (_, i) => addDays(tomorrow, i + 1)).map((date) => {
                  const dayEntries = data.entries.filter((e) => e.date === date);
                  return (
                    <Link key={date} href={`/day/${date}`} className="block">
                      <Card className="px-3.5 py-3 flex items-center gap-3 active:bg-surface-2 pressable">
                        <div className="w-[70px] shrink-0">
                          <p className="text-sm font-semibold leading-tight">{weekdayOf(date).slice(0, 3)}</p>
                          <p className="text-[11px] text-muted">{friendlyDate(date, today)}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          {dayEntries.length === 0 ? (
                            <p className="text-sm text-muted">Nothing planned</p>
                          ) : (
                            <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                              {SLOTS.filter((s) => dayEntries.some((e) => e.slot === s)).map((slot) => (
                                <span key={slot} className="inline-flex items-center gap-1 text-sm min-w-0">
                                  <span className="text-[11px]">{SLOT_EMOJI[slot]}</span>
                                  <span className="truncate">
                                    {dayEntries.filter((e) => e.slot === slot).map((e) => e.dish.name).join(", ")}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="size-4 text-muted shrink-0" />
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>

            <Link
              href="/plan"
              className={cx(
                "block text-center text-sm text-accent-text font-medium py-3 mb-4 rounded-2xl",
                "active:bg-accent-soft pressable",
              )}
            >
              See the whole fortnight →
            </Link>
          </>
        )}
      </div>
    </>
  );
}
