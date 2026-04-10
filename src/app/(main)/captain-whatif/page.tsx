"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhatIfGw {
  gw: number;
  actualCaptain: { id: number; name: string; pts: number };
  bestOwned:     { id: number; name: string; pts: number };
  orgBest:       { id: number; name: string; pts: number; managerName: string } | null;
  missedPts: number;
  actualImpact: number;
  isOptimal: boolean;
}

interface WhatIfManager {
  managerId: number;
  displayName: string;
  teamName: string;
  gws: WhatIfGw[];
  totalMissedPts: number;
  totalActualImpact: number;
  optimalPicks: number;
  biggestMiss: WhatIfGw | null;
  bestDecision: WhatIfGw | null;
}

interface WhatIfResponse {
  managers: WhatIfManager[];
  currentGw: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function accuracy(m: WhatIfManager) {
  const total = m.gws.length;
  return total > 0 ? Math.round((m.optimalPicks / total) * 100) : 0;
}

// ── Missed pts chart ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MissedPtsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const gw = payload[0]?.payload as WhatIfGw;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[170px]">
      <p className="font-semibold text-slate-700 mb-1.5">GW{label}</p>
      {gw.isOptimal ? (
        <p className="text-emerald-600 font-semibold">✓ Optimal pick</p>
      ) : (
        <>
          <div className="flex justify-between gap-3 py-0.5">
            <span className="text-slate-500">Captained</span>
            <span className="font-semibold text-slate-700 truncate max-w-[90px] text-right">
              {gw.actualCaptain.name} ({gw.actualCaptain.pts}pts)
            </span>
          </div>
          <div className="flex justify-between gap-3 py-0.5">
            <span className="text-slate-500">Best owned</span>
            <span className="font-semibold text-amber-700 truncate max-w-[90px] text-right">
              {gw.bestOwned.name} ({gw.bestOwned.pts}pts)
            </span>
          </div>
          <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-slate-100">
            <span className="text-slate-500">Raw missed</span>
            <span className="font-black text-red-600">−{gw.missedPts} pts</span>
          </div>
          <div className="flex justify-between gap-3 py-0.5">
            <span className="text-slate-500">Score impact</span>
            <span className="font-bold text-red-500">−{gw.actualImpact} pts</span>
          </div>
        </>
      )}
    </div>
  );
}

function MissedPtsChart({ gws }: { gws: WhatIfGw[] }) {
  // Chart needs chronological order (oldest → newest, left → right)
  const chartData = [...gws].sort((a, b) => a.gw - b.gw);

  const maxMissed = Math.max(...chartData.map((g) => g.missedPts), 1);

  // Colour scale: optimal = emerald, small miss = amber, large miss = red
  function barColour(g: WhatIfGw): string {
    if (g.isOptimal) return "#10b981";           // emerald-500
    if (g.missedPts <= 4)  return "#f59e0b";     // amber-500
    if (g.missedPts <= 10) return "#f97316";     // orange-500
    return "#ef4444";                             // red-500
  }

  const optimalCount = chartData.filter((g) => g.isOptimal).length;
  const worstGw = chartData.reduce(
    (b, g) => (g.missedPts > b.missedPts ? g : b),
    chartData[0]
  );

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3 flex-wrap border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Missed Captain Pts per GW</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Bar height = raw pts missed · score impact is double
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-slate-500">{optimalCount} optimal</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            <span className="text-slate-500">{chartData.length - optimalCount} missed</span>
          </span>
          {!worstGw.isOptimal && (
            <span className="text-slate-400">
              Worst: <span className="font-semibold text-red-600">GW{worstGw.gw} (−{worstGw.missedPts})</span>
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 12, left: -16, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="gw"
              tickFormatter={(v) => `GW${v}`}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, Math.ceil(maxMissed * 1.15)]}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<MissedPtsTooltip />}
              cursor={{ fill: "#f8fafc" }}
            />
            {/* Zero line for emphasis */}
            <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1} />
            <Bar dataKey="missedPts" radius={[3, 3, 0, 0]} maxBarSize={40}>
              {chartData.map((g, i) => (
                <Cell key={i} fill={barColour(g)} opacity={g.isOptimal ? 0.9 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── GW row ────────────────────────────────────────────────────────────────────

function GwRow({ g }: { g: WhatIfGw }) {
  const isGood   = g.missedPts === 0;
  const isBad    = g.missedPts >= 10;

  return (
    <div
      className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${
        isGood ? "bg-emerald-50/40" : isBad ? "bg-red-50/30" : ""
      }`}
    >
      {/* GW badge */}
      <div className="shrink-0 w-10">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">GW{g.gw}</span>
      </div>

      {/* Captain comparison */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Actual captain */}
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 w-14 shrink-0">Captained</span>
          <span className={`font-semibold ${isGood ? "text-emerald-700" : "text-slate-700"}`}>
            {g.actualCaptain.name}
          </span>
          <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full border ${
            isGood
              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            {g.actualCaptain.pts} pts
          </span>
          {isGood && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full">
              ✓ Optimal
            </span>
          )}
        </div>

        {/* Best available (only show if not optimal) */}
        {!isGood && (
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-500 w-14 shrink-0">Best owned</span>
            <span className="font-semibold text-amber-700">{g.bestOwned.name}</span>
            <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
              {g.bestOwned.pts} pts
            </span>
          </div>
        )}

        {/* Org best caption (if different from best owned) */}
        {g.orgBest && g.orgBest.id !== g.bestOwned.id && (
          <div className="flex items-center gap-2 text-xs flex-wrap text-slate-400">
            <span className="font-semibold w-14 shrink-0">Org best</span>
            <span>{g.orgBest.name}</span>
            <span className="font-bold tabular-nums">{g.orgBest.pts} pts</span>
            <span className="text-slate-300">({g.orgBest.managerName})</span>
          </div>
        )}
      </div>

      {/* Cost badge */}
      <div className="shrink-0 text-right sm:min-w-[90px]">
        {isGood ? (
          <span className="text-xs font-bold text-emerald-600">No pts lost</span>
        ) : (
          <div>
            <div className="text-sm font-black tabular-nums text-red-600">
              −{g.missedPts} pts
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              −{g.actualImpact} to total
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Org ranking table ─────────────────────────────────────────────────────────

function OrgRanking({ managers }: { managers: WhatIfManager[] }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Captain Decision Ranking</h2>
        <p className="text-xs text-slate-400">Least to most missed pts (sorted best picker first)</p>
      </div>
      <div className="divide-y divide-slate-50">
        {managers.map((m, i) => {
          const acc = accuracy(m);
          return (
            <div key={m.managerId} className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap">
              {/* Rank */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                i === 0 ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {i + 1}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{m.displayName}</p>
                <p className="text-xs text-slate-400">{m.optimalPicks}/{m.gws.length} optimal · {acc}% accuracy</p>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-sm font-black tabular-nums text-red-500">−{m.totalActualImpact}</p>
                  <p className="text-[10px] text-slate-400">pts lost</p>
                </div>
                {/* Accuracy bar */}
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                  <div
                    className={`h-full rounded-full ${acc >= 60 ? "bg-emerald-400" : acc >= 30 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${acc}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CaptainWhatIfPage() {
  const { data, isLoading, isError } = useQuery<WhatIfResponse>({
    queryKey: ["captain-whatif"],
    queryFn: async () => {
      const r = await fetch("/api/captain-whatif");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  const [selectedManager, setSelectedManager] = useState<number | null>(null);

  const managers     = data?.managers ?? [];
  const activeId     = selectedManager ?? managers[0]?.managerId ?? null;
  const active       = managers.find((m) => m.managerId === activeId) ?? null;
  const acc          = active ? accuracy(active) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">What If I&apos;d Captained X?</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Every GW: who you captained, who you should have, and what it cost you.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 w-28 bg-white border border-slate-200 rounded-lg animate-pulse shrink-0" />)}
          </div>
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="px-4 py-3 border-b border-slate-50 space-y-1.5">
                <div className="h-3 bg-slate-100 rounded animate-pulse w-1/4" />
                <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {managers.length > 0 && (
        <>
          {/* Manager tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {managers.map((m) => {
              const isActive = m.managerId === activeId;
              return (
                <button
                  key={m.managerId}
                  onClick={() => setSelectedManager(m.managerId)}
                  className={`shrink-0 flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all duration-150 ${
                    isActive
                      ? "bg-[#37003c] border-[#37003c] text-white shadow-md"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 shadow-card"
                  }`}
                >
                  <span className="text-xs font-semibold truncate max-w-[90px]">
                    {m.displayName}
                  </span>
                  <span className={`text-[10px] font-bold tabular-nums mt-0.5 ${
                    isActive ? "text-red-300" : "text-red-500"
                  }`}>
                    −{m.totalActualImpact} pts
                  </span>
                </button>
              );
            })}
          </div>

          {active && (
            <div className="space-y-4">
              {/* Season summary strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SumTile
                  label="Total pts lost"
                  value={`−${active.totalActualImpact}`}
                  sub="actual score impact"
                  warn
                />
                <SumTile
                  label="Raw missed"
                  value={`−${active.totalMissedPts} pts`}
                  sub="before ×2 multiplier"
                />
                <SumTile
                  label="Optimal picks"
                  value={`${active.optimalPicks} / ${active.gws.length}`}
                  sub={`${acc}% accuracy`}
                  highlight={acc >= 50}
                />
                {active.biggestMiss && (
                  <SumTile
                    label="Biggest miss"
                    value={`GW${active.biggestMiss.gw} (−${active.biggestMiss.actualImpact} pts)`}
                    sub={`${active.biggestMiss.actualCaptain.name} → ${active.biggestMiss.bestOwned.name}`}
                    warn
                  />
                )}
              </div>

              {/* Missed pts chart */}
              {active.gws.length > 0 && <MissedPtsChart gws={active.gws} />}

              {/* GW breakdown */}
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
                {/* Column header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <span>GW · Captain comparison</span>
                  <span>Cost</span>
                </div>

                <div className="divide-y divide-slate-50">
                  {active.gws.map((g) => <GwRow key={g.gw} g={g} />)}
                </div>

                {active.gws.length === 0 && (
                  <div className="py-12 text-center text-sm text-slate-400">
                    No captain data available yet.
                  </div>
                )}

                {/* Footer */}
                <div className={`px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs`}>
                  <span className="text-slate-400">
                    {active.optimalPicks} optimal pick{active.optimalPicks !== 1 ? "s" : ""} this season
                  </span>
                  <span className="text-red-500 font-semibold tabular-nums">
                    Total impact: −{active.totalActualImpact} pts
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Org ranking */}
          <OrgRanking managers={managers} />

          <p className="text-xs text-slate-400 text-center px-2">
            &ldquo;Best owned&rdquo; = highest-scoring player in your 15-man squad that GW.
            &ldquo;Pts lost&rdquo; = raw difference × 2 (the actual impact on your total score).
          </p>
        </>
      )}
    </div>
  );
}

function SumTile({
  label, value, sub, highlight, warn,
}: {
  label: string; value: string; sub?: string; highlight?: boolean; warn?: boolean;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 border shadow-card ${
      highlight ? "bg-emerald-50 border-emerald-200" :
      warn      ? "bg-red-50 border-red-200" :
                  "bg-white border-slate-200/80"
    }`}>
      <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${
        highlight ? "text-emerald-500" : warn ? "text-red-400" : "text-slate-400"
      }`}>{label}</p>
      <p className={`text-sm font-black truncate ${
        highlight ? "text-emerald-700" : warn ? "text-red-600" : "text-slate-900"
      }`}>{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 truncate ${highlight ? "text-emerald-500" : warn ? "text-red-400" : "text-slate-400"}`}>{sub}</p>}
    </div>
  );
}
