"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser, HouseholdInfo } from "@/lib/types";

type Session = { user: SessionUser; household: HouseholdInfo };

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ user, household, children }: Session & { children: ReactNode }) {
  return <SessionContext.Provider value={{ user, household }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside the app layout");
  return ctx;
}
