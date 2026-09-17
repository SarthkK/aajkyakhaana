import { cx } from "@/components/ui";

/**
 * Every skeleton below mirrors the real component's geometry — same paddings, same
 * row heights, same number of rows. That is the whole point: the screen must not
 * move when the data lands.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

/** Matches DaySummaryCard's collapsed state: two lines of text plus two bars. */
export function SummaryCardSkeleton() {
  return (
    <div className="bg-surface border border-line rounded-3xl p-4">
      <Skeleton className="h-4 w-52 mb-2" />
      <Skeleton className="h-3 w-36" />
      <div className="mt-3 space-y-2.5">
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="flex justify-between mb-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches EntryCard: veg dot, title, byline, and the two vote buttons. */
function EntryCardSkeleton() {
  return (
    <div className="bg-surface border border-line rounded-2xl px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="size-3.5 rounded-[3px]" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Matches DayBoard: a heading plus three slot cards. */
export function DayBoardSkeleton({ filledSlots = 1 }: { filledSlots?: number }) {
  return (
    <section className="mb-7">
      <div className="flex items-baseline justify-between px-1 mb-2.5">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="bg-surface-2/60 border border-line rounded-3xl p-2.5">
            <div className="flex items-center justify-between px-1.5 pb-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-10" />
            </div>
            {slot < filledSlots ? <EntryCardSkeleton /> : <Skeleton className="h-11 w-full rounded-2xl" />}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Matches the /plan day cards. */
export function PlanListSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-surface border border-line rounded-3xl p-4">
          <div className="flex items-center justify-between mb-2.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            {i % 2 === 0 && <Skeleton className="h-3.5 w-1/2" />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matches the dish library rows. */
export function DishListSkeleton() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="bg-surface border border-line rounded-3xl p-3.5 flex items-center gap-3">
          <Skeleton className="size-3.5 rounded-[3px]" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-4 w-36 mb-2" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="size-4 rounded" />
        </li>
      ))}
    </ul>
  );
}

/** Matches the grouped shopping list. */
export function ShoppingListSkeleton() {
  return (
    <div className="space-y-5">
      {[3, 2].map((rows, group) => (
        <section key={group}>
          <Skeleton className="h-3.5 w-28 mb-2 ml-1" />
          <ul className="rounded-3xl border border-line overflow-hidden divide-y divide-line">
            {Array.from({ length: rows }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 bg-surface px-3.5 py-3">
                <Skeleton className="size-6 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1.5" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Matches the stacked cards on the Me tab. */
export function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      {[2, 3, 4].map((fields, card) => (
        <div key={card}>
          {card > 0 && <Skeleton className="h-3.5 w-24 mb-2 ml-1" />}
          <div className="bg-surface border border-line rounded-3xl p-4 space-y-4">
            {Array.from({ length: fields }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3.5 w-20 mb-2" />
                <Skeleton className="h-11 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matches the dish editor. */
export function DishEditorSkeleton() {
  return (
    <div className="space-y-5">
      <div className="bg-surface border border-line rounded-3xl p-4 space-y-4">
        <Skeleton className="h-3.5 w-16 mb-1" />
        <Skeleton className="h-11 w-full rounded-2xl" />
        <Skeleton className="h-3.5 w-28 mb-1" />
        <Skeleton className="h-9 w-full rounded-full" />
      </div>
      <div>
        <Skeleton className="h-3.5 w-32 mb-2 ml-1" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-surface border border-line rounded-3xl p-3">
              <Skeleton className="h-10 w-full rounded-2xl mb-2" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-20 rounded-2xl" />
                <Skeleton className="h-10 w-24 rounded-2xl" />
                <Skeleton className="h-10 flex-1 rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
