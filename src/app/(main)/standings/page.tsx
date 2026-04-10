"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GwSelector } from "@/components/standings/GwSelector";
import { LeaderboardTable } from "@/components/standings/LeaderboardTable";
import { PointsRaceChart } from "@/components/standings/PointsRaceChart";
import { SkeletonTable } from "@/components/ui/Skeleton";

interface ManagerTitle {
  managerId: number;
  title: string;
  description: string;
  colour: string;
  border: string;
}

interface StandingsData {
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
  orgAverageGwPoints: number;
  globalAverageGwPoints: number;
}

interface GameweeksData {
  currentGameweek: number;
}

export default function StandingsPage() {
  const [selectedGw, setSelectedGw] = useState<number | null>(null);

  const { data: gwData } = useQuery<GameweeksData>({
    queryKey: ["gameweeks"],
    queryFn: () => fetch("/api/gameweeks").then((r) => r.json()),
    staleTime: 300_000,
  });

  const currentGw = gwData?.currentGameweek;
  const activeGw = selectedGw ?? currentGw;

  const { data: titlesData } = useQuery<{ titles: ManagerTitle[] }>({
    queryKey: ["titles"],
    queryFn: () => fetch("/api/titles").then((r) => r.json()),
    staleTime: 300_000,
  });

  const titlesMap = titlesData
    ? new Map(titlesData.titles.map((t) => [t.managerId, t]))
    : undefined;

  const { data, isLoading, isError, error } = useQuery<StandingsData, { code?: string }>({
    queryKey: ["standings", activeGw],
    queryFn: () =>
      fetch(`/api/standings${activeGw ? `?gw=${activeGw}` : ""}`).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw json;
        return json;
      }),
    enabled: activeGw !== undefined,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Organisation gameweek standings</p>
        </div>
        {currentGw && (
          <GwSelector
            selectedGw={activeGw ?? currentGw}
            onChange={(gw) => setSelectedGw(gw)}
          />
        )}
      </div>

      {/* Points race chart — always visible once GW data is known */}
      {currentGw && <PointsRaceChart currentGw={currentGw} />}

      {/* Content */}
      {isLoading && <SkeletonTable rows={8} cols={4} />}
      {isError && (error as { code?: string })?.code === "ORG_NOT_CONFIGURED" && (
        <div className="bg-amber-50 border border-amber-200/80 text-amber-800 px-4 py-3 rounded-xl text-sm shadow-card">
          No organisation configured yet.{" "}
          <a href="/admin" className="font-semibold underline underline-offset-2 hover:text-amber-900">
            Go to Admin
          </a>{" "}
          to set up your organisation and add members.
        </div>
      )}
      {isError && (error as { code?: string })?.code !== "ORG_NOT_CONFIGURED" && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm shadow-card">
          Unable to load standings. The FPL API may be temporarily unavailable.
        </div>
      )}
      {data && (
        <LeaderboardTable
          standings={data.standings}
          orgAverageGwPoints={data.orgAverageGwPoints}
          globalAverageGwPoints={data.globalAverageGwPoints}
          titles={titlesMap}
        />
      )}
    </div>
  );
}
