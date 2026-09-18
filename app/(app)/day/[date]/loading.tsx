import { PageLoading } from "@/components/PageLoading";
import { DayBoardSkeleton, SummaryCardSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageLoading>
      <div className="mb-4">
        <SummaryCardSkeleton />
      </div>
      <DayBoardSkeleton filledSlots={1} />
    </PageLoading>
  );
}
