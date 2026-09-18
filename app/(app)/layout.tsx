import { BottomNav } from "@/components/BottomNav";
import { SessionProvider } from "@/components/SessionProvider";
import { ToastProvider } from "@/components/Toast";
import { Prefetcher } from "@/components/Prefetcher";
import { Splash } from "@/components/Splash";
import { InstallAndNotify } from "@/components/InstallAndNotify";

/**
 * Deliberately does no server work at all.
 *
 * It reads no cookies and touches no database, which is what lets every page beneath
 * it be static and prefetched — the difference between a tab switch being instant and
 * being a ~600ms round trip. `middleware.ts` turns signed-out visitors away before
 * they get here, and SessionProvider fetches who they are.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SessionProvider>
      <ToastProvider>
        <Splash />
        <div className="max-w-md mx-auto w-full">{children}</div>
        <BottomNav />
        <Prefetcher />
        <InstallAndNotify />
      </ToastProvider>
    </SessionProvider>
  );
}
