"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { mapAdminPath } from "@/lib/routing/admin-path-mapper";

interface MeMembership {
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
  role: "member" | "admin";
  isActive: boolean;
}

interface MeResponse {
  memberships?: MeMembership[];
}

interface Props {
  currentLeagueSlug: string;
  currentLeagueName: string;
}

export function LeagueSwitcher({ currentLeagueSlug, currentLeagueName }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";

  const { data } = useQuery<MeResponse | null>({
    queryKey: ["me-leagues"],
    queryFn: () => fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
    staleTime: 60_000,
  });

  const memberships = (data?.memberships ?? []).filter((m) => m.isActive);
  const others = memberships.filter((m) => m.leagueSlug !== currentLeagueSlug);

  if (memberships.length <= 1 || others.length === 0) {
    return (
      <h1 className="font-semibold text-slate-700 text-sm tracking-tight truncate">
        {currentLeagueName}
      </h1>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-2 py-1 -mx-2 -my-1 rounded-md text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="truncate">{currentLeagueName}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-slate-400 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-20">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-slate-400">
              Switch league
            </div>
            {others.map((m) => (
              <Link
                key={m.leagueSlug}
                href={mapAdminPath(pathname, m.leagueSlug, m.role)}
                className="block px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
                onClick={() => setOpen(false)}
              >
                {m.leagueName}
                {m.role === "admin" && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">Admin</span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
