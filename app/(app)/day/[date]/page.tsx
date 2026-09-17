"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApi } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import { DayBoard } from "@/components/DayBoard";
import { DaySummaryCard } from "@/components/DaySummaryCard";
import { ErrorNote } from "@/components/ui";
import { DayBoardSkeleton, SummaryCardSkeleton } from "@/components/Skeleton";
import { addDays, friendlyDate, weekdayOf, isValidDate } from "@/lib/dates";
import type { PlanResponse, PlanEntryView } from "@/lib/types";

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  const router = useRouter();
  const [version, setVersion] = useState(0);

  const valid = isValidDate(date);
  const { data, error, loading, reload, setData } = useApi<PlanResponse>(
    valid ? `/api/plan?from=${date}&to=${date}` : null,
  );

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    void reload();
  }, [reload]);

  const patchEntry = useCallback(
    (id: string, patch: Partial<PlanEntryView>) => {
      setData((prev) =>
        prev ? { ...prev, entries: prev.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : prev,
      );
    },
    [setData],
  );

  if (!valid) {
    return (
      <>
        <AppHeader title="Not a date" back="/plan" />
        <div className="p-4">
          <ErrorNote>That link does not point at a real day.</ErrorNote>
        </div>
      </>
    );
  }

  const today = data?.today ?? date;

  return (
    <>
      <AppHeader
        title={friendlyDate(date, today)}
        subtitle={weekdayOf(date)}
        back="/plan"
        action={
          <div className="flex items-center">
            <button
              onClick={() => router.push(`/day/${addDays(date, -1)}`)}
              className="p-2 text-muted"
              aria-label="Previous day"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => router.push(`/day/${addDays(date, 1)}`)}
              className="p-2 text-muted"
              aria-label="Next day"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        }
      />

      <div className="px-4 pt-4">
        {loading && !data && (
          <>
            <div className="mb-4">
              <SummaryCardSkeleton />
            </div>
            <DayBoardSkeleton filledSlots={1} />
          </>
        )}
        {error && !data && <ErrorNote>{error}</ErrorNote>}

        {data && (
          <>
            <div className="mb-4">
              <DaySummaryCard key={`${date}-${version}`} date={date} />
            </div>
            <DayBoard
              date={date}
              today={today}
              entries={data.entries}
              onChanged={refresh}
              patchEntry={patchEntry}
              slots={["breakfast", "lunch", "dinner", "snack"]}
            />
          </>
        )}
      </div>
    </>
  );
}
