"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useApi } from "@/lib/client";
import { AppHeader } from "@/components/AppHeader";
import { DayBoard } from "@/components/DayBoard";
import { DaySummaryCard } from "@/components/DaySummaryCard";
import { ErrorNote } from "@/components/ui";
import { DayBoardSkeleton, SummaryCardSkeleton } from "@/components/Skeleton";
import { useSession } from "@/components/SessionProvider";
import { addDays } from "@/lib/dates";
import type { PlanResponse, PlanEntryView } from "@/lib/types";

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
          <Link href="/plan" className="p-2 text-muted" aria-label="Full plan">
            <CalendarDays className="size-5" />
          </Link>
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
            <div className="mb-4">
              <DaySummaryCard key={`${today}-${version}`} date={today} />
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

            <Link
              href="/plan"
              className="block text-center text-sm text-accent-text font-medium py-3 mb-4"
            >
              See the whole week →
            </Link>
          </>
        )}
      </div>
    </>
  );
}
