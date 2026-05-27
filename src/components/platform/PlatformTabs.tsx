"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/platform",
    label: "Leagues",
    match: (p: string) => p === "/platform" || p.startsWith("/platform/leagues"),
  },
  {
    href: "/platform/users",
    label: "Users",
    match: (p: string) => p.startsWith("/platform/users"),
  },
  {
    href: "/platform/audit",
    label: "Audit log",
    match: (p: string) => p.startsWith("/platform/audit"),
  },
] as const;

export function PlatformTabs() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-slate-200 mb-6 flex gap-1">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              active
                ? "border-[#37003c] text-[#37003c]"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
