"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const POSITION_LABELS: Record<number, string> = {
  1: "GK",
  2: "DEF",
  3: "MID",
  4: "FWD",
};

const POSITION_COLOURS: Record<number, string> = {
  1: "bg-yellow-100 text-yellow-700",
  2: "bg-blue-100 text-blue-700",
  3: "bg-emerald-100 text-emerald-700",
  4: "bg-red-100 text-red-700",
};

interface PlayerRef {
  id: number;
  name: string;
  team: string;
  elementType: number;
  costTenths: number;
}

interface Transfer {
  playerIn: PlayerRef;
  playerOut: PlayerRef;
  time: string;
}

interface ManagerActivity {
  managerId: number;
  displayName: string;
  teamName: string;
  transferCost: number;
  transfers: Transfer[];
}

interface PopularMove {
  playerId: number;
  name: string;
  team: string;
  elementType: number;
  count: number;
  managers: string[];
}

interface TransfersResponse {
  gameweekId: number;
  totalMembers: number;
  managers: ManagerActivity[];
  popularIns: PopularMove[];
  popularOuts: PopularMove[];
  availableGws: { id: number; name: string; isCurrent: boolean }[];
}

function PositionBadge({ type }: { type: number }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${POSITION_COLOURS[type] ?? "bg-slate-100 text-slate-500"}`}>
      {POSITION_LABELS[type] ?? "?"}
    </span>
  );
}

function PlayerPill({
  player,
  direction,
}: {
  player: PlayerRef;
  direction: "in" | "out";
}) {
  const colour = direction === "in"
    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : "bg-red-50 border-red-200 text-red-700";

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${colour} text-xs font-medium`}>
      <PositionBadge type={player.elementType} />
      <span className="font-semibold">{player.name}</span>
      <span className="opacity-60 text-[10px]">{player.team}</span>
      <span className="opacity-50 text-[10px] tabular-nums">£{(player.costTenths / 10).toFixed(1)}m</span>
    </div>
  );
}

function PopularMoveRow({
  move,
  totalMembers,
  direction,
}: {
  move: PopularMove;
  totalMembers: number;
  direction: "in" | "out";
}) {
  const pct = Math.round((move.count / totalMembers) * 100);
  const isDifferential = move.count === 1;
  const isCrowd = move.count >= 3;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <PositionBadge type={move.elementType} />
        <span className="font-semibold text-sm text-slate-800 truncate">{move.name}</span>
        <span className="text-xs text-slate-400 shrink-0">{move.team}</span>
        {isDifferential && direction === "in" && (
          <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
            Diff
          </span>
        )}
        {isCrowd && direction === "in" && (
          <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
            Crowd
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Progress bar */}
        <div className="hidden sm:block w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${direction === "in" ? "bg-emerald-400" : "bg-red-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-600 tabular-nums w-12 text-right">
          {move.count}/{totalMembers}
        </span>
      </div>
    </div>
  );
}

export default function TransfersPage() {
  const [selectedGw, setSelectedGw] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<TransfersResponse>({
    queryKey: ["transfers", selectedGw],
    queryFn: async () => {
      const url = selectedGw ? `/api/transfers?gw=${selectedGw}` : "/api/transfers";
      const r = await fetch(url);
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  // Once we have data, use data.gameweekId as default if no selection made
  const activeGw = selectedGw ?? data?.gameweekId;

  const totalTransfers = data?.managers.reduce((s, m) => s + m.transfers.length, 0) ?? 0;
  const totalHits = data?.managers.reduce((s, m) => s + m.transferCost, 0) ?? 0;
  const managersWithTransfers = data?.managers.filter((m) => m.transfers.length > 0) ?? [];
  const managersNoTransfers = data?.managers.filter((m) => m.transfers.length === 0) ?? [];

  // Crowd picks: transferred in by 2+ managers
  const crowdPicks = data?.popularIns.filter((p) => p.count >= 2) ?? [];
  // Differentials: transferred in by exactly 1 manager
  const differentials = data?.popularIns.filter((p) => p.count === 1) ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transfer Activity</h1>
          <p className="text-sm text-slate-400 mt-0.5">Who moved what before the deadline</p>
        </div>

        {/* GW selector */}
        {data && data.availableGws.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Gameweek</label>
            <div className="relative">
              <select
                value={activeGw ?? ""}
                onChange={(e) => setSelectedGw(parseInt(e.target.value))}
                className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c]/50 bg-white cursor-pointer shadow-sm"
              >
                {data.availableGws.map((gw) => (
                  <option key={gw.id} value={gw.id}>
                    {gw.name}{gw.isCurrent ? " ★" : ""}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-4 animate-pulse shadow-card">
              <div className="h-4 bg-slate-100 rounded w-40 mb-4" />
              <div className="space-y-3">
                {[1, 2].map((j) => <div key={j} className="h-10 bg-slate-100 rounded" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load transfer data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="Transfers made"
              value={String(totalTransfers)}
              sub={`across ${managersWithTransfers.length} manager${managersWithTransfers.length !== 1 ? "s" : ""}`}
            />
            <SummaryCard
              label="Points hits"
              value={totalHits > 0 ? `-${totalHits}` : "None"}
              sub={totalHits > 0 ? "total deduction" : "all free transfers"}
              danger={totalHits > 0}
            />
            <SummaryCard
              label="Crowd picks"
              value={String(crowdPicks.length)}
              sub={crowdPicks.length > 0 ? crowdPicks.slice(0, 2).map((p) => p.name).join(", ") : "no consensus"}
            />
            <SummaryCard
              label="Differentials"
              value={String(differentials.length)}
              sub={differentials.length > 0 ? "unique transfers in" : "everyone aligned"}
              highlight={differentials.length > 0}
            />
          </div>

          {/* Crowd picks + popular outs side by side */}
          {(data.popularIns.length > 0 || data.popularOuts.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Transfers IN */}
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                  <h2 className="text-sm font-semibold text-slate-700">Transferred In</h2>
                </div>
                <div className="px-4 divide-y divide-slate-50">
                  {data.popularIns.map((move) => (
                    <PopularMoveRow
                      key={move.playerId}
                      move={move}
                      totalMembers={data.totalMembers}
                      direction="in"
                    />
                  ))}
                  {data.popularIns.length === 0 && (
                    <p className="py-6 text-sm text-slate-400 text-center">No transfers in</p>
                  )}
                </div>
              </div>

              {/* Transfers OUT */}
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                  <h2 className="text-sm font-semibold text-slate-700">Transferred Out</h2>
                </div>
                <div className="px-4 divide-y divide-slate-50">
                  {data.popularOuts.map((move) => (
                    <PopularMoveRow
                      key={move.playerId}
                      move={move}
                      totalMembers={data.totalMembers}
                      direction="out"
                    />
                  ))}
                  {data.popularOuts.length === 0 && (
                    <p className="py-6 text-sm text-slate-400 text-center">No transfers out</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* No transfers at all */}
          {totalTransfers === 0 && !isLoading && (
            <div className="bg-white border border-slate-200/80 rounded-xl px-5 py-8 text-center shadow-card">
              <p className="text-sm text-slate-500 font-medium">No transfers made this gameweek</p>
              <p className="text-xs text-slate-400 mt-1">All {data.totalMembers} managers kept their squads</p>
            </div>
          )}

          {/* Per-manager breakdown */}
          {managersWithTransfers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700">Manager Breakdown</h2>
              <div className="space-y-3">
                {managersWithTransfers.map((m) => (
                  <div key={m.managerId} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
                    {/* Manager header */}
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{m.displayName}</p>
                        <p className="text-xs text-slate-400">{m.teamName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {m.transfers.length} transfer{m.transfers.length !== 1 ? "s" : ""}
                        </span>
                        {m.transferCost > 0 && (
                          <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            -{m.transferCost} pts hit
                          </span>
                        )}
                        {m.transferCost === 0 && m.transfers.length > 0 && (
                          <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">
                            Free
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Transfer rows */}
                    <div className="divide-y divide-slate-50">
                      {m.transfers.map((t, idx) => {
                        // Is this playerIn a differential (only this manager in the org)?
                        const inPopularity = data.popularIns.find((p) => p.playerId === t.playerIn.id)?.count ?? 1;
                        const isDiff = inPopularity === 1;
                        const isCrowd = inPopularity >= 2;

                        return (
                          <div key={idx} className="px-4 py-3 flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                            {/* OUT */}
                            <PlayerPill player={t.playerOut} direction="out" />

                            {/* Arrow */}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-300">
                              <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>

                            {/* IN */}
                            <PlayerPill player={t.playerIn} direction="in" />

                            {/* Badge */}
                            <div className="flex items-center gap-1.5 ml-auto">
                              {isDiff && (
                                <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-2 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
                                  Differential
                                </span>
                              )}
                              {isCrowd && (
                                <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
                                  Crowd pick
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Managers who held */}
          {managersNoTransfers.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-700">No Transfers</h2>
              </div>
              <div className="px-4 py-2 flex flex-wrap gap-2">
                {managersNoTransfers.map((m) => (
                  <span key={m.managerId} className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-lg">
                    {m.displayName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  danger,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
  highlight?: boolean;
}) {
  const bg = danger
    ? "bg-red-50 border-red-200"
    : highlight
    ? "bg-violet-50 border-violet-200"
    : "bg-white border-slate-200/80";
  const valueColour = danger ? "text-red-600" : highlight ? "text-violet-700" : "text-slate-900";

  return (
    <div className={`rounded-xl px-4 py-3.5 border ${bg} shadow-card`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-black tabular-nums ${valueColour}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
