"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "settings", label: "Settings" },
  { href: "members", label: "Members" },
  { href: "digest", label: "Digest" },
  { href: "audit", label: "Audit log" },
] as const;

export function AdminTabs({ leagueSlug }: { leagueSlug: string }) {
  const pathname = usePathname();
  return (
    <nav className="border-b border-slate-200 mb-6 flex gap-1">
      {TABS.map((tab) => {
        const href = `/l/${leagueSlug}/admin/${tab.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.href}
            href={href}
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
