import { PageLoading } from "@/components/PageLoading";
import { DishEditorSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageLoading>
      <DishEditorSkeleton />
    </PageLoading>
  );
}
