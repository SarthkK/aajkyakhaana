import { PageLoading } from "@/components/PageLoading";
import { DishListSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageLoading>
      <Skeleton className="h-12 w-full rounded-2xl mb-3" />
      <Skeleton className="h-9 w-64 rounded-full mb-4" />
      <DishListSkeleton />
    </PageLoading>
  );
}
