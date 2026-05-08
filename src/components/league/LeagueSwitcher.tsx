"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface MeResponse {
  userAccount?: { id: string; email: string };
  memberships?: Array<{
    leagueId: string;
    leagueSlug: string;
    leagueName: string;
    role: "member" | "admin";
    isActive: boolean;
  }>;
}

interface Props {
  currentLeagueSlug: string;
  currentLeagueName: string;
}

export function LeagueSwitcher({ currentLeagueSlug, currentLeagueName }: Props) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery<MeResponse>({
    queryKey: ["me-leagues"],
    queryFn: () => fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
    staleTime: 60_000,
  });

  const memberships = (data?.memberships ?? []).filter((m) => m.isActive);
  const others = memberships.filter((m) => m.leagueSlug !== currentLeagueSlug);

  if (memberships.length <= 1) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white/10 text-sm text-white">
        {currentLeagueName}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-sm text-white hover:bg-white/15"
      >
        <span>{currentLeagueName}</span>
        <span className="text-xs opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-10">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-slate-400">
            Switch league
          </div>
          {others.map((m) => (
            <Link
              key={m.leagueSlug}
              href={`/l/${m.leagueSlug}/standings`}
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
      )}
    </div>
  );
}
