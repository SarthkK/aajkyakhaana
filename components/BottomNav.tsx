"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ShoppingCart, Sun, BookOpen, User } from "lucide-react";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/dishes", label: "Dishes", icon: BookOpen },
  { href: "/shopping", label: "List", icon: ShoppingCart },
  { href: "/me", label: "Me", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="max-w-md mx-auto flex">
        {TABS.map(({ href, label, icon: Icon }) => {
          // /day/... is part of planning, so keep that tab lit while browsing a date.
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === "/plan" && pathname.startsWith("/day/"));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cx(
                  "flex flex-col items-center gap-1 py-2.5 transition",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                <span className="text-[11px] font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
