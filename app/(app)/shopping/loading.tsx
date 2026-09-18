import { PageLoading } from "@/components/PageLoading";
import { ShoppingListSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageLoading>
      <Skeleton className="h-12 w-full rounded-2xl mb-3" />
      <Skeleton className="h-11 w-full rounded-2xl mb-4" />
      <ShoppingListSkeleton />
    </PageLoading>
  );
}
