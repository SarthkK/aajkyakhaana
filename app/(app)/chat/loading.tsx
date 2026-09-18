import { PageLoading } from "@/components/PageLoading";
import { Skeleton } from "@/components/Skeleton";
import { cx } from "@/lib/cx";

export default function Loading() {
  return (
    <PageLoading>
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cx("flex gap-2.5", i % 2 === 1 && "flex-row-reverse")}>
            <Skeleton className="size-8 rounded-full shrink-0" />
            <Skeleton className={cx("h-12 rounded-2xl", i % 2 ? "w-40" : "w-52")} />
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
