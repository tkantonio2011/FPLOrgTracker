"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LeagueSwitcher } from "@/components/league/LeagueSwitcher";
import { PLATFORM_NAME } from "@/lib/branding/strings";

interface NavProps {
  currentGw?: number;
  onMenuToggle: () => void;
}

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

function extractLeagueSlug(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/l\/([^/]+)/);
  return match?.[1] ?? null;
}

export function Nav({ currentGw, onMenuToggle }: NavProps) {
  const pathname = usePathname();
  const currentLeagueSlug = extractLeagueSlug(pathname);

  const { data } = useQuery<MeResponse | null>({
    queryKey: ["me-leagues"],
    queryFn: () => fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
    staleTime: 60_000,
    enabled: currentLeagueSlug !== null,
  });

  const currentLeague = currentLeagueSlug
    ? data?.memberships?.find((m) => m.leagueSlug === currentLeagueSlug && m.isActive) ?? null
    : null;

  return (
    <header className="bg-white border-b border-slate-200/80 px-4 py-3.5 flex items-center gap-3 sticky top-0 z-10 backdrop-blur-sm bg-white/95">
      <button
        onClick={onMenuToggle}
        className="md:hidden shrink-0 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      <div className="flex-1 min-w-0">
        {currentLeague ? (
          <LeagueSwitcher
            currentLeagueSlug={currentLeague.leagueSlug}
            currentLeagueName={currentLeague.leagueName}
          />
        ) : (
          <h1 className="font-semibold text-slate-700 text-sm tracking-tight truncate">{PLATFORM_NAME}</h1>
        )}
      </div>

      {currentGw && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#00ff87] animate-pulse" />
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full tabular">
            GW {currentGw}
          </span>
        </div>
      )}
    </header>
  );
}
