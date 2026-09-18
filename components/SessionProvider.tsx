"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/client";
import { Skeleton } from "@/components/Skeleton";
import type { SessionUser, HouseholdInfo } from "@/lib/types";

type Session = { user: SessionUser; household: HouseholdInfo };

const SessionContext = createContext<Session | null>(null);

/**
 * Who is signed in and which flat they are in.
 *
 * Fetched over the API rather than rendered into the page by the server, so that no
 * page under this provider has to be dynamic — that is what makes tab switches
 * instant. SWR caches the result, so the wait below happens once per cold load and
 * never again while the app is open.
 *
 * Children are held back until the session exists, which keeps `useSession()`
 * synchronous for every component that uses it.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, error } = useApi<{ user: SessionUser | null; household: HouseholdInfo | null }>("/api/auth/me");

  const signedOut = data ? !data.user : false;
  const withoutFlat = data ? Boolean(data.user) && !data.household : false;

  useEffect(() => {
    // Middleware only checks the token's signature; these two cases need the database,
    // so they are settled here.
    if (signedOut) router.replace("/login");
    else if (withoutFlat) router.replace("/welcome");
  }, [signedOut, withoutFlat, router]);

  if (error || !data?.user || !data.household) return <AppShellSkeleton />;

  return (
    <SessionContext.Provider value={{ user: data.user, household: data.household }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside the app layout");
  return ctx;
}

/** Shown for the moment before the session lands, and while redirecting. */
function AppShellSkeleton() {
  return (
    <div className="max-w-md mx-auto w-full">
      <header
        className="sticky top-0 z-30 bg-bg/90 backdrop-blur border-b border-line px-4 pb-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <Skeleton className="h-6 w-40 mb-1.5" />
        <Skeleton className="h-3 w-24" />
      </header>
      <div className="px-4 pt-4 space-y-3">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    </div>
  );
}
