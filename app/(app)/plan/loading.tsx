import { PageLoading } from "@/components/PageLoading";
import { PlanListSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageLoading>
      <Skeleton className="h-11 w-full rounded-2xl mb-3" />
      <PlanListSkeleton />
    </PageLoading>
  );
}
