"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

const CHIP_LABELS: Record<string, string> = {
  bboost: "BB",
  "3xc": "TC",
  freehit: "FH",
  wildcard: "WC",
};

const CHIP_COLOURS: Record<string, string> = {
  bboost: "bg-blue-100 text-blue-700",
  "3xc": "bg-purple-100 text-purple-700",
  freehit: "bg-orange-100 text-orange-700",
  wildcard: "bg-teal-100 text-teal-700",
};

interface ManagerLive {
  rank: number;
  managerId: number;
  displayName: string;
  teamName: string;
  livePoints: number;
  chipUsed: string | null;
  captain: { name: string; livePoints: number; multiplier: number } | null;
}

interface LiveResponse {
  gameweekId: number;
  gameweekName: string;
  isLive: boolean;
  isFinished: boolean;
  managers: ManagerLive[];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-amber-500 font-black text-sm">1st</span>;
  if (rank === 2) return <span className="text-slate-400 font-black text-sm">2nd</span>;
  if (rank === 3) return <span className="text-amber-700 font-black text-sm">3rd</span>;
  return <span className="text-slate-500 font-semibold text-sm">{rank}th</span>;
}

function RefreshCountdown({ nextRefreshIn }: { nextRefreshIn: number }) {
  return (
    <span className="text-xs text-slate-400 tabular-nums">
      Refreshing in {nextRefreshIn}s
    </span>
  );
}

export default function LivePage() {
  const REFRESH_INTERVAL = 60;
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<LiveResponse>({
    queryKey: ["live"],
    queryFn: async () => {
      const r = await fetch("/api/live");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: (REFRESH_INTERVAL - 5) * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as LiveResponse | undefined;
      return data?.isLive ? REFRESH_INTERVAL * 1000 : false;
    },
  });

  // Update last updated time when data changes
  useEffect(() => {
    if (dataUpdatedAt) {
      setLastUpdated(new Date(dataUpdatedAt));
      setCountdown(REFRESH_INTERVAL);
    }
  }, [dataUpdatedAt]);

  // Countdown timer — only when live
  useEffect(() => {
    if (!data?.isLive) return;
    const id = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [data?.isLive]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Points</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {data
              ? `${data.gameweekName} — real-time org leaderboard`
              : "Real-time gameweek scores"}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {data?.isLive && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff87] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00ff87]" />
              </span>
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Live</span>
            </div>
          )}
          {data && !data.isLive && (
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {data.isFinished ? "Final" : "Pre-kickoff"}
            </span>
          )}
          <div className="flex flex-col items-end gap-0.5">
            {lastUpdated && (
              <span className="text-xs text-slate-400">
                Updated {formatTime(lastUpdated)}
              </span>
            )}
            {data?.isLive && <RefreshCountdown nextRefreshIn={countdown} />}
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card animate-pulse">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 h-10" />
          <div className="divide-y divide-slate-50">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="h-4 bg-slate-100 rounded w-8 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-slate-100 rounded w-32" />
                  <div className="h-3 bg-slate-100 rounded w-24" />
                </div>
                <div className="h-6 bg-slate-100 rounded w-12" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load live points. The FPL API may be temporarily unavailable.
        </div>
      )}

      {/* No live GW notice */}
      {data && !data.isLive && !data.isFinished && (
        <div className="bg-amber-50 border border-amber-200/80 text-amber-800 px-4 py-3 rounded-xl text-sm shadow-card">
          {data.gameweekName} hasn&apos;t kicked off yet. Scores will update automatically once matches begin.
        </div>
      )}

      {/* Leaderboard */}
      {data && data.managers.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[3rem_1fr_8rem_8rem_6rem] px-5 py-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">#</div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Manager</div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Captain</div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Cap pts</div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">GW pts</div>
          </div>

          <div className="divide-y divide-slate-50">
            {data.managers.map((m, idx) => {
              const isLeader = m.rank === 1;
              const prevRank = idx > 0 ? data.managers[idx - 1].rank : null;
              const gap = prevRank !== null ? data.managers[idx - 1].livePoints - m.livePoints : 0;

              return (
                <div
                  key={m.managerId}
                  className={`px-4 sm:px-5 py-3.5 flex sm:grid sm:grid-cols-[3rem_1fr_8rem_8rem_6rem] items-center gap-3 ${
                    isLeader ? "bg-emerald-50/60" : ""
                  }`}
                >
                  {/* Rank */}
                  <div className="w-10 sm:w-auto shrink-0 text-center sm:text-left">
                    <RankBadge rank={m.rank} />
                  </div>

                  {/* Manager info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-sm truncate ${isLeader ? "text-slate-900" : "text-slate-700"}`}>
                        {m.displayName}
                      </span>
                      {m.chipUsed && CHIP_LABELS[m.chipUsed] && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CHIP_COLOURS[m.chipUsed] ?? "bg-gray-100 text-gray-600"}`}>
                          {CHIP_LABELS[m.chipUsed]}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{m.teamName}</div>
                    {/* Mobile: captain + gap inline */}
                    <div className="flex items-center gap-2 mt-1 sm:hidden text-xs text-slate-500">
                      {m.captain && (
                        <span>
                          ©&nbsp;{m.captain.name}
                          {m.captain.multiplier > 1 && (
                            <span className="text-purple-600 font-semibold ml-0.5">
                              {m.captain.multiplier === 3 ? " (TC)" : ""}
                            </span>
                          )}
                          &nbsp;
                          <span className="font-semibold text-slate-700">{m.captain.livePoints}pts</span>
                        </span>
                      )}
                      {gap > 0 && (
                        <span className="text-slate-400">−{gap} pts</span>
                      )}
                    </div>
                  </div>

                  {/* Captain name — desktop */}
                  <div className="hidden sm:block text-center">
                    {m.captain ? (
                      <span className="text-xs text-slate-600 font-medium">
                        {m.captain.name}
                        {m.captain.multiplier === 3 && (
                          <span className="ml-1 text-[10px] text-purple-600 font-bold">TC</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>

                  {/* Captain pts — desktop */}
                  <div className="hidden sm:block text-center">
                    {m.captain ? (
                      <span className="text-sm font-semibold text-slate-700">
                        {m.captain.livePoints}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>

                  {/* Live GW points */}
                  <div className="ml-auto sm:ml-0 text-right shrink-0">
                    <span className={`text-lg font-black tabular-nums ${isLeader ? "text-emerald-600" : "text-slate-800"}`}>
                      {m.livePoints}
                    </span>
                    {gap > 0 && (
                      <div className="hidden sm:block text-[10px] text-slate-400 tabular-nums text-right">
                        −{gap}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-slate-400">
              {data.isLive
                ? "Scores include provisional bonus points and update every 60 seconds"
                : data.isFinished
                ? "Final scores — gameweek complete"
                : "Scores will update once the gameweek begins"}
            </span>
            {data.managers.length > 0 && (
              <span className="text-xs text-slate-400 tabular-nums">
                Avg:{" "}
                <span className="font-semibold text-slate-600">
                  {Math.round(
                    data.managers.reduce((s, m) => s + m.livePoints, 0) /
                      data.managers.length
                  )}
                  pts
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {data && data.managers.length === 0 && !isLoading && (
        <div className="bg-white border border-slate-200/80 rounded-xl px-5 py-10 text-center text-sm text-slate-400 shadow-card">
          No managers found. Make sure your organisation is configured in{" "}
          <a href="/admin" className="text-[#37003c] font-semibold underline underline-offset-2">
            Admin
          </a>
          .
        </div>
      )}
    </div>
  );
}
