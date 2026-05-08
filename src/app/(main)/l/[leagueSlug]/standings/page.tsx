"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GwSelector } from "@/components/standings/GwSelector";
import { LeaderboardTable } from "@/components/standings/LeaderboardTable";
import { PointsRaceChart } from "@/components/standings/PointsRaceChart";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useLeague } from "@/components/league/LeagueProvider";

interface ManagerTitle {
  managerId: number;
  title: string;
  description: string;
  colour: string;
  border: string;
}

interface StandingsApiBody {
  success: boolean;
  data?: {
    gameweekId: number;
    standings: {
      rank: number;
      rankChange: number;
      managerId: number;
      displayName: string;
      teamName: string;
      gameweekPoints: number;
      totalPoints: number;
      overallRank: number;
      chipUsed: string | null;
      pointsBehindLeader: number;
    }[];
    leagueAverageGwPoints: number;
    globalAverageGwPoints: number;
  };
  error?: string;
}

interface GameweeksData {
  currentGameweek: number;
}

export default function LeagueStandingsPage() {
  const { league } = useLeague();
  const [selectedGw, setSelectedGw] = useState<number | null>(null);

  const { data: gwData } = useQuery<GameweeksData>({
    queryKey: ["gameweeks"],
    queryFn: () => fetch("/api/gameweeks").then((r) => r.json()),
    staleTime: 300_000,
  });
  const currentGw = gwData?.currentGameweek;
  const activeGw = selectedGw ?? currentGw;

  const { data: titlesData } = useQuery<{ titles: ManagerTitle[] }>({
    queryKey: ["titles", league.id],
    queryFn: () => fetch("/api/titles").then((r) => r.json()),
    staleTime: 300_000,
  });
  const titlesMap = titlesData ? new Map(titlesData.titles.map((t) => [t.managerId, t])) : undefined;

  const { data, isLoading, isError } = useQuery<StandingsApiBody>({
    queryKey: ["standings", league.id, activeGw],
    queryFn: async () => {
      const res = await fetch(
        `/api/leagues/${league.id}/standings${activeGw ? `?gw=${activeGw}` : ""}`,
      );
      const body = (await res.json()) as StandingsApiBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Standings failed");
      return body;
    },
    enabled: activeGw !== undefined,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const standings = data?.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">{league.name} — gameweek standings</p>
        </div>
        {currentGw && (
          <GwSelector selectedGw={activeGw ?? currentGw} onChange={(gw) => setSelectedGw(gw)} />
        )}
      </div>

      {currentGw && <PointsRaceChart currentGw={currentGw} />}

      {isLoading && <SkeletonTable rows={8} cols={4} />}
      {isError && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm shadow-card">
          Unable to load standings. The FPL API may be temporarily unavailable.
        </div>
      )}
      {standings && (
        <LeaderboardTable
          standings={standings.standings}
          orgAverageGwPoints={standings.leagueAverageGwPoints}
          globalAverageGwPoints={standings.globalAverageGwPoints}
          titles={titlesMap}
        />
      )}
    </div>
  );
}
