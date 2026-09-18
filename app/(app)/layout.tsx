import { redirect } from "next/navigation";
import { getUserId, getActiveHousehold, getCurrentUser } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { SessionProvider } from "@/components/SessionProvider";
import { ToastProvider } from "@/components/Toast";
import { Prefetcher } from "@/components/Prefetcher";
import { Splash } from "@/components/Splash";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const [user, household] = await Promise.all([getCurrentUser(), getActiveHousehold(userId)]);
  if (!user) redirect("/login");
  if (!household) redirect("/welcome");

  return (
    <SessionProvider user={user} household={household}>
      <ToastProvider>
        <Splash />
        <div className="max-w-md mx-auto w-full">{children}</div>
        <BottomNav />
        <Prefetcher />
      </ToastProvider>
    </SessionProvider>
  );
}
