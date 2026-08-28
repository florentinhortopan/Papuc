"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const BASE_ITEMS = [
  { href: "/home", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/lenders", label: "Lenders" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();
  const items = showAdmin
    ? [
        ...BASE_ITEMS.slice(0, -1),
        { href: "/admin", label: "Admin" },
        BASE_ITEMS[BASE_ITEMS.length - 1]!,
      ]
    : BASE_ITEMS;

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
      <div className="container flex items-center justify-between h-14">
        <Link
          href="/home"
          className="text-text font-bold text-lg tracking-tight"
        >
          Papuc
        </Link>
        <nav className="flex gap-1 overflow-x-auto">
          {items.map((item) => {
            const active =
              item.href === "/home"
                ? pathname === "/home" || pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary/15 text-primary border border-primary/40"
                    : "text-textMuted hover:text-text hover:bg-surface",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
