"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Fixture {
  id: number;
  gameweekId: number | null;
  teamH: { id: number; shortName: string };
  teamA: { id: number; shortName: string };
  teamHDifficulty: number;
  teamADifficulty: number;
  teamHScore: number | null;
  teamAScore: number | null;
  kickoffTime: string | null;
  finished: boolean;
  isDgwForTeamH: boolean;
  isDgwForTeamA: boolean;
}

interface Gameweek {
  id: number;
  name: string;
  deadlineTime: string;
  isFinished: boolean;
  isCurrent: boolean;
  isNext: boolean;
}

interface FixturesResponse {
  fixtures: Fixture[];
}

interface GameweeksResponse {
  currentGameweek: number;
  gameweeks: Gameweek[];
}

const DIFFICULTY_COLOURS: Record<number, string> = {
  1: "bg-emerald-600",
  2: "bg-lime-400",
  3: "bg-slate-300",
  4: "bg-orange-400",
  5: "bg-red-600",
};

function DifficultyBadge({ fdr }: { fdr: number }) {
  return (
    <span className={`w-3 h-3 rounded-sm inline-block shrink-0 ${DIFFICULTY_COLOURS[fdr] ?? "bg-gray-200"}`} title={`FDR ${fdr}`} />
  );
}

function formatKickoff(iso: string | null): string {
  if (!iso) return "TBC";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FixturesPage() {
  const [gwCount, setGwCount] = useState(5);

  const { data: gwData } = useQuery<GameweeksResponse>({
    queryKey: ["gameweeks"],
    queryFn: () => fetch("/api/gameweeks").then((r) => r.json()),
    staleTime: 300_000,
  });

  const isLiveGw = gwData?.gameweeks.some((gw) => gw.isCurrent && !gw.isFinished) ?? false;

  const { data: fixturesData, isLoading, isError } = useQuery<FixturesResponse>({
    queryKey: ["fixtures-all"],
    queryFn: () => fetch("/api/fixtures").then((r) => r.json()),
    staleTime: 60_000,
    refetchInterval: isLiveGw ? 60_000 : false,
  });

  const currentGw = gwData?.currentGameweek;

  // Upcoming GWs to show — only once we know which GW is current
  const upcomingGws = currentGw
    ? (gwData?.gameweeks ?? []).filter((gw) => gw.id >= currentGw).slice(0, gwCount)
    : [];

  const gwMap = new Map((gwData?.gameweeks ?? []).map((gw) => [gw.id, gw]));

  // Group fixtures by GW
  const fixturesByGw = new Map<number, Fixture[]>();
  for (const gw of upcomingGws) {
    fixturesByGw.set(gw.id, []);
  }
  for (const f of fixturesData?.fixtures ?? []) {
    if (f.gameweekId !== null && fixturesByGw.has(f.gameweekId)) {
      fixturesByGw.get(f.gameweekId)!.push(f);
    }
  }
  // Sort fixtures within each GW by kickoff time
  Array.from(fixturesByGw.values()).forEach((fixtures) => {
    fixtures.sort((a: Fixture, b: Fixture) => {
      if (!a.kickoffTime) return 1;
      if (!b.kickoffTime) return -1;
      return a.kickoffTime.localeCompare(b.kickoffTime);
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fixtures</h1>
          <p className="text-sm text-slate-400 mt-0.5">Upcoming Premier League gameweeks</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">FDR:</span>
          {([1, 2, 3, 4, 5] as const).map((fdr) => (
            <div key={fdr} className="flex items-center gap-1.5">
              <DifficultyBadge fdr={fdr} />
              <span className="text-xs text-slate-400">
                {fdr === 1 ? "Very easy" : fdr === 2 ? "Easy" : fdr === 3 ? "Medium" : fdr === 4 ? "Hard" : "Very hard"}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <label className="text-xs font-medium">Show next</label>
          <div className="relative">
            <select
              value={gwCount}
              onChange={(e) => setGwCount(parseInt(e.target.value))}
              className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c]/50 bg-white cursor-pointer shadow-sm"
            >
              {[2, 3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>{n} gameweeks</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-4 animate-pulse shadow-card">
              <div className="h-4 bg-slate-100 rounded-md w-32 mb-4" />
              <div className="space-y-2.5">
                {[1, 2, 3].map((j) => <div key={j} className="h-8 bg-slate-100 rounded-md" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load fixtures. The FPL API may be temporarily unavailable.
        </div>
      )}

      {!isLoading && !isError && upcomingGws.map((gw) => {
        const fixtures = fixturesByGw.get(gw.id) ?? [];
        const gwInfo = gwMap.get(gw.id);
        const isDgwGw = fixtures.some((f) => f.isDgwForTeamH || f.isDgwForTeamA);

        return (
          <div key={gw.id} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            {/* GW header */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">{gw.name}</h2>
                {gw.isCurrent && (
                  <span className="text-[10px] bg-[#00ff87] text-[#37003c] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Live</span>
                )}
                {gw.isNext && !gw.isCurrent && (
                  <span className="text-[10px] bg-[#37003c] text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Next</span>
                )}
                {isDgwGw && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">DGW</span>
                )}
              </div>
              {gwInfo && (
                <span className="text-xs text-slate-400">
                  Deadline: {formatDeadline(gwInfo.deadlineTime)}
                </span>
              )}
            </div>

            {/* Fixtures list */}
            {fixtures.length === 0 ? (
              <div className="px-5 py-6 text-sm text-slate-400 text-center">
                No fixtures scheduled yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {fixtures.map((f) => (
                  <div key={f.id} className="px-3 sm:px-5 py-2.5 flex items-center gap-2 sm:gap-3">
                    {/* Kickoff */}
                    <span className="text-xs text-slate-400 w-24 sm:w-36 shrink-0 tabular">
                      {formatKickoff(f.kickoffTime)}
                    </span>

                    {/* Home team */}
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      {f.isDgwForTeamH && (
                        <span className="text-[10px] text-amber-600 font-bold">DGW</span>
                      )}
                      <span className={`font-semibold text-sm ${f.finished && f.teamHScore !== null && f.teamAScore !== null && f.teamHScore > f.teamAScore ? "text-slate-900" : "text-slate-600"}`}>
                        {f.teamH.shortName}
                      </span>
                      {!f.finished && <DifficultyBadge fdr={f.teamHDifficulty} />}
                    </div>

                    {/* Score or vs */}
                    {f.finished && f.teamHScore !== null && f.teamAScore !== null ? (
                      <span className="text-sm font-bold text-slate-800 tabular-nums shrink-0 w-10 text-center">
                        {f.teamHScore}–{f.teamAScore}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300 font-medium shrink-0 w-10 text-center">vs</span>
                    )}

                    {/* Away team */}
                    <div className="flex items-center gap-1.5 flex-1">
                      {!f.finished && <DifficultyBadge fdr={f.teamADifficulty} />}
                      <span className={`font-semibold text-sm ${f.finished && f.teamHScore !== null && f.teamAScore !== null && f.teamAScore > f.teamHScore ? "text-slate-900" : "text-slate-600"}`}>
                        {f.teamA.shortName}
                      </span>
                      {f.isDgwForTeamA && (
                        <span className="text-[10px] text-amber-600 font-bold">DGW</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
