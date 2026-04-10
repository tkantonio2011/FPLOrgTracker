"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OwnershipTable } from "@/components/ownership/OwnershipTable";
import { PlayerOwnershipDetail } from "@/components/ownership/PlayerOwnershipDetail";
import { SkeletonTable } from "@/components/ui/Skeleton";

interface OwnershipPlayer {
  playerId: number;
  webName: string;
  teamShortName: string;
  elementType: number;
  form: string;
  nowCost: number;
  ownerCount: number;
  ownerDisplayNames: string[];
  orgOwnershipPercent: number;
  captainCount: number;
  totalPointsForOwners: number;
  isStartingForAllOwners: boolean;
}

interface OwnershipData {
  gameweekId: number;
  players: OwnershipPlayer[];
  totalMembers: number;
}

export default function OwnershipPage() {
  const [selectedPlayer, setSelectedPlayer] = useState<OwnershipPlayer | null>(null);

  const { data, isLoading, isError } = useQuery<OwnershipData>({
    queryKey: ["ownership"],
    queryFn: () => fetch("/api/ownership").then((r) => r.json()),
    staleTime: 300_000,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Player Ownership</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Who owns what across the organisation
          {data && ` · GW${data.gameweekId} · ${data.totalMembers} members`}
        </p>
      </div>

      {isLoading && <SkeletonTable rows={10} cols={7} />}
      {isError && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm shadow-card">
          Unable to load ownership data.
        </div>
      )}
      {data && (
        <OwnershipTable
          players={data.players}
          totalMembers={data.totalMembers}
          onSelectPlayer={(p) => setSelectedPlayer(p)}
        />
      )}

      {selectedPlayer && (
        <PlayerOwnershipDetail
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
