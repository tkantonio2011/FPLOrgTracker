"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PointsChart } from "@/components/performance/PointsChart";
import { BenchSummary } from "@/components/performance/BenchSummary";
import { PlayerContributionList } from "@/components/performance/PlayerContributionList";
import { SkeletonCard } from "@/components/ui/Skeleton";

interface HistoryEntry {
  gameweekId: number;
  points: number;
  totalPoints: number;
  pointsOnBench: number;
  overallRank: number;
  transfersMade: number;
  transfersCost: number;
  chipUsed: string | null;
  globalAvgPoints: number | null;
  orgAvgPoints: number | null;
}

interface SeasonSummary {
  totalPoints: number;
  bestGameweek: { id: number; points: number } | null;
  worstGameweek: { id: number; points: number } | null;
  totalBenchPoints: number;
  totalTransferCost: number;
}

interface PerformanceData {
  managerId: number;
  displayName: string;
  teamName: string;
  history: HistoryEntry[];
  seasonSummary: SeasonSummary;
}

interface Pick {
  position: number;
  playerId: number;
  webName: string;
  teamShortName: string;
  elementType: number;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  points: number;
  epNext: number;
  status: string;
  news: string;
}

interface SquadData {
  managerId: number;
  gameweekId: number;
  activeChip: string | null;
  picks: Pick[];
  error?: string;
  code?: string;
}

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);

const TipsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
  </svg>
);

interface StatCardProps {
  value: string | number;
  label: string;
  accent?: "purple" | "green" | "orange" | "slate";
}

function StatCard({ value, label, accent = "slate" }: StatCardProps) {
  const accents = {
    purple: "text-[#37003c]",
    green: "text-emerald-600",
    orange: "text-orange-500",
    slate: "text-slate-700",
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-4 text-center shadow-card">
      <p className={`text-2xl font-bold tabular ${accents[accent]}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

// ── Season Narrative card ──────────────────────────────────────────────────────

function SeasonNarrativeCard({
  managerId,
  currentGw,
}: {
  managerId: string;
  currentGw: number | null;
}) {
  const [narrative, setNarrative]   = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [failed, setFailed]         = useState(false);
  const generatedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentGw) return;
    const cacheKey = `season-narrative-${managerId}-gw${currentGw}`;
    if (generatedRef.current === cacheKey) return;
    generatedRef.current = cacheKey;

    // Check localStorage first
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setNarrative(cached); return; }
    } catch { /* ignore */ }

    // Generate
    setLoading(true);
    fetch(`/api/members/${managerId}/narrative`)
      .then((r) => r.json())
      .then((data: { narrative?: string; error?: string }) => {
        if (data.narrative) {
          setNarrative(data.narrative);
          try {
            localStorage.setItem(cacheKey, data.narrative);
            // Evict old GW entries for this manager
            for (let g = 1; g < currentGw; g++) {
              localStorage.removeItem(`season-narrative-${managerId}-gw${g}`);
            }
          } catch { /* ignore */ }
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [managerId, currentGw]);

  // If Groq isn't configured or generation failed silently, render nothing
  if (failed || (!loading && !narrative)) return null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1e0a24] via-[#2d1040] to-[#1a0d28] border border-[#5a3070]/40 shadow-lg">
      {/* Decorative quote mark */}
      <div className="absolute top-3 left-4 text-[80px] leading-none font-black text-white/5 select-none pointer-events-none">
        &ldquo;
      </div>

      <div className="px-6 pt-5 pb-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300/70">
              Season Narrative
            </span>
          </div>
          <span className="text-[10px] text-purple-400/50 tabular-nums">
            GW{currentGw} edition
          </span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-2 py-1">
            <div className="h-3.5 bg-white/10 rounded animate-pulse w-full" />
            <div className="h-3.5 bg-white/10 rounded animate-pulse w-5/6" />
            <div className="h-3.5 bg-white/10 rounded animate-pulse w-full" />
            <div className="h-3.5 bg-white/10 rounded animate-pulse w-4/6" />
          </div>
        ) : narrative ? (
          <p className="text-sm text-white/80 leading-relaxed italic relative z-10">
            {narrative}
          </p>
        ) : null}

        {/* Footer */}
        {narrative && (
          <div className="mt-3 pt-2.5 border-t border-white/8 flex items-center justify-between">
            <span className="text-[10px] text-purple-400/40">
              Auto-generated · EnergyOne FPL Programme
            </span>
            <span className="text-[10px] text-purple-400/40 flex items-center gap-1">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
              Powered by AI
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MemberPerformancePage() {
  const params = useParams();
  const managerId = params.managerId as string;

  const [selectedGw, setSelectedGw] = useState<number | null>(null);

  const { data: performance, isLoading: perfLoading, isError: perfError } = useQuery<PerformanceData>({
    queryKey: ["performance", managerId],
    queryFn: () => fetch(`/api/members/${managerId}/performance`).then((r) => r.json()),
    staleTime: 300_000,
  });

  const mostRecentGw =
    performance?.history && performance.history.length > 0
      ? performance.history[performance.history.length - 1].gameweekId
      : null;

  const activeGw = selectedGw ?? mostRecentGw;

  const { data: squad, isLoading: squadLoading } = useQuery<SquadData>({
    queryKey: ["squad", managerId, activeGw],
    queryFn: () => fetch(`/api/members/${managerId}/squad?gw=${activeGw}`).then((r) => r.json()),
    enabled: activeGw !== null,
    staleTime: 120_000,
  });

  const isPrivate = squad?.code === "MANAGER_PRIVATE";
  const completedGws = performance?.history.map((h) => h.gameweekId) ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Navigation bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/standings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <BackIcon />
          Standings
        </Link>
        <Link
          href={`/suggestions/${managerId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-[#37003c] text-white px-4 py-2 rounded-lg hover:bg-[#4f005e] transition-colors shadow-sm cursor-pointer"
        >
          <TipsIcon />
          Transfer Tips &amp; Chips
        </Link>
      </div>

      {/* Loading state */}
      {perfLoading && (
        <div className="space-y-4">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={5} />
        </div>
      )}

      {/* Error state */}
      {perfError && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm shadow-card">
          Unable to load member performance. The FPL API may be temporarily unavailable.
        </div>
      )}

      {performance && (
        <>
          {/* Heading */}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{performance.displayName}</h1>
            <p className="text-sm text-slate-400 mt-0.5">{performance.teamName}</p>
          </div>

          {/* AI Season Narrative */}
          <SeasonNarrativeCard managerId={managerId} currentGw={mostRecentGw} />

          {/* Season summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              value={performance.seasonSummary.totalPoints}
              label="Total Points"
              accent="purple"
            />
            {performance.seasonSummary.bestGameweek && (
              <StatCard
                value={performance.seasonSummary.bestGameweek.points}
                label={`Best GW (GW ${performance.seasonSummary.bestGameweek.id})`}
                accent="green"
              />
            )}
            <StatCard
              value={performance.seasonSummary.totalBenchPoints}
              label="Bench Pts Wasted"
              accent="orange"
            />
          </div>

          {/* Points chart */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-card">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Points Per Gameweek</h2>
            <PointsChart history={performance.history} />
          </div>

          {/* Bench summary */}
          <BenchSummary history={performance.history} />

          {/* GW selector */}
          {completedGws.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="gw-select" className="text-xs font-medium text-slate-500">
                View squad for:
              </label>
              <div className="relative">
                <select
                  id="gw-select"
                  value={activeGw ?? ""}
                  onChange={(e) => setSelectedGw(Number(e.target.value))}
                  className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c]/50 bg-white cursor-pointer shadow-sm tabular"
                >
                  {completedGws.map((gw) => (
                    <option key={gw} value={gw}>GW {gw}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>
          )}

          {/* Private team banner */}
          {isPrivate && (
            <div className="bg-blue-50 border border-blue-200/80 text-blue-700 px-4 py-3 rounded-xl text-sm shadow-card">
              This member&apos;s team is set to private on FPL. Ask them to make their team public in their FPL settings.
            </div>
          )}

          {/* Squad list */}
          {squadLoading && activeGw && <SkeletonCard rows={15} />}

          {squad && !isPrivate && squad.picks && activeGw && (
            <PlayerContributionList picks={squad.picks} gameweekId={activeGw} />
          )}
        </>
      )}
    </div>
  );
}
