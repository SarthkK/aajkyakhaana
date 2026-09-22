"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ShoppingCart, Sun, MessageCircle, User, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";
import { prefetch } from "@/lib/client";
import { tap } from "@/lib/haptics";

const TABS = [
  { href: "/today", label: "Today", icon: Sun, data: ["/api/plan"] },
  { href: "/plan", label: "Plan", icon: CalendarDays, data: ["/api/plan"] },
  { href: "/chat", label: "Chat", icon: MessageCircle, data: ["/api/chat"] },
  { href: "/shopping", label: "List", icon: ShoppingCart, data: ["/api/shopping"] },
  { href: "/me", label: "Me", icon: User, data: ["/api/profile", "/api/households/members"] },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    // The height is declared rather than left to the content, so --tabbar-h is a fact and
    // not a guess — see app/globals.css.
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-lg border-t border-line"
      style={{ height: "calc(var(--tabbar-h) + env(safe-area-inset-bottom))", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="max-w-md mx-auto flex h-full">
        {TABS.map(({ href, label, icon: Icon, data }) => {
          // /day/... is part of planning, so keep that tab lit while browsing a date.
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === "/plan" && pathname.startsWith("/day/"));

          // Warm the data the moment a finger lands, before the tap even completes.
          const warm = () => data.forEach((path) => void prefetch(path).catch(() => {}));

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                // These five are the whole app and are always on screen, so fetch them
                // fully rather than only as far as the loading boundary. Dynamic routes
                // are not prefetched by default, which is what left every tab switch
                // waiting on a server round trip.
                prefetch
                onPointerDown={warm}
                onPointerEnter={warm}
                onClick={() => !active && tap()}
                aria-current={active ? "page" : undefined}
                className="flex h-full items-center justify-center"
              >
                <Tab icon={Icon} label={label} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Lights up the moment the link is tapped rather than when the next page arrives.
 *
 * Without this the tab only changes once navigation completes, so a tap on a slow
 * connection feels ignored and people tap again. useLinkStatus reports the pending
 * state of the Link this component sits inside.
 */
function Tab({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  const lit = active || pending;

  return (
    <span
      className={cx(
        "relative flex flex-col items-center gap-1 py-2.5 transition-colors duration-100",
        lit ? "text-accent" : "text-muted",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute top-0 h-0.5 rounded-full bg-accent transition-all duration-200",
          lit ? "w-8 opacity-100" : "w-0 opacity-0",
        )}
      />
      <Icon
        className={cx("size-[22px] transition-transform duration-150", lit && "scale-110")}
        strokeWidth={lit ? 2.4 : 1.8}
      />
      <span className="text-[11px] font-medium">{label}</span>
    </span>
  );
}
