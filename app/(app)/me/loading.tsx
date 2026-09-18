import { PageLoading } from "@/components/PageLoading";
import { ProfileSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageLoading>
      <ProfileSkeleton />
    </PageLoading>
  );
}
