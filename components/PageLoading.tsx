import { Skeleton } from "@/components/Skeleton";

/**
 * The frame every route shows the instant it is tapped.
 *
 * These exist for one reason: without a loading boundary, Next blocks on the server
 * before painting anything, so a tap leaves the *old* page on screen for as long as
 * the render takes — which reads as the app freezing and the tap being ignored. A
 * boundary also unlocks prefetching, because a dynamic route can only be prefetched
 * as far as its nearest loading file.
 *
 * The header is a skeleton rather than the real title because the title depends on
 * session data this boundary deliberately does not wait for.
 */
export function PageLoading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header
        className="sticky top-0 z-30 bg-bg/90 backdrop-blur border-b border-line px-4 pb-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <Skeleton className="h-6 w-40 mb-1.5" />
        <Skeleton className="h-3 w-24" />
      </header>
      <div className="px-4 pt-4">{children}</div>
    </>
  );
}
