"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ShoppingCart, Sun, BookOpen, User } from "lucide-react";
import { cx } from "@/components/ui";
import { prefetch } from "@/lib/client";
import { tap } from "@/lib/haptics";

const TABS = [
  { href: "/today", label: "Today", icon: Sun, data: ["/api/plan"] },
  { href: "/plan", label: "Plan", icon: CalendarDays, data: ["/api/plan"] },
  { href: "/dishes", label: "Dishes", icon: BookOpen, data: ["/api/dishes"] },
  { href: "/shopping", label: "List", icon: ShoppingCart, data: ["/api/shopping"] },
  { href: "/me", label: "Me", icon: User, data: ["/api/profile", "/api/households/members"] },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-lg border-t border-line"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="max-w-md mx-auto flex">
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
                onPointerDown={warm}
                onPointerEnter={warm}
                onClick={() => !active && tap()}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex flex-col items-center gap-1 py-2.5 transition-colors",
                  active ? "text-accent" : "text-muted active:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "absolute top-0 h-0.5 rounded-full bg-accent transition-all duration-200",
                    active ? "w-8 opacity-100" : "w-0 opacity-0",
                  )}
                />
                <Icon
                  className={cx("size-[22px] transition-transform", active && "scale-110")}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                <span className="text-[11px] font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
