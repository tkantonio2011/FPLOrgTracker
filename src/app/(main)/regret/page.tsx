"use client";

import { useState } from "react";
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

interface RegretTransfer {
  playerIn:  { id: number; name: string; pts: number };
  playerOut: { id: number; name: string; pts: number };
  net: number;
}

interface RegretGw {
  gw: number;
  transfers: RegretTransfer[];
  hitCost: number;
  chipUsed: string | null;
  gwNet: number;
}

interface ManagerRegret {
  managerId: number;
  displayName: string;
  teamName: string;
  gws: RegretGw[];
  seasonNet: number;
  totalHitCost: number;
  bestTransfer: (RegretTransfer & { gw: number }) | null;
  worstTransfer: (RegretTransfer & { gw: number }) | null;
}

interface RegretResponse {
  managers: ManagerRegret[];
  currentGw: number;
}

// ── GW net bar chart ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GwNetTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const gw = payload[0]?.payload as RegretGw;
  const chip = gw.chipUsed ? CHIP_LABELS[gw.chipUsed] ?? gw.chipUsed : null;
  const net: number = gw.gwNet;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[160px]">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="font-semibold text-slate-700">GW{label}</span>
        {chip && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
            {chip}
          </span>
        )}
      </div>
      <div className="flex justify-between gap-3 py-0.5">
        <span className="text-slate-400">Transfers</span>
        <span className="font-semibold text-slate-700">{gw.transfers.length}</span>
      </div>
      {gw.hitCost < 0 && (
        <div className="flex justify-between gap-3 py-0.5">
          <span className="text-slate-400">Hit cost</span>
          <span className="font-semibold text-red-500">{gw.hitCost} pts</span>
        </div>
      )}
      <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-slate-100">
        <span className="font-semibold text-slate-600">GW net</span>
        <span className={`font-black tabular-nums ${net > 0 ? "text-emerald-600" : net < 0 ? "text-red-500" : "text-slate-400"}`}>
          {net > 0 ? `+${net}` : net} pts
        </span>
      </div>
    </div>
  );
}

function GwNetChart({
  gws,
  highlightedGw,
  onBarClick,
}: {
  gws: RegretGw[];
  highlightedGw: number | null;
  onBarClick: (gw: number) => void;
}) {
  const sorted = [...gws].sort((a, b) => a.gw - b.gw);

  const nets = sorted.map((g) => g.gwNet);
  const absMax = Math.max(...nets.map(Math.abs), 1);
  const bound  = Math.ceil(absMax * 1.25);

  const totalPositive = nets.filter((n) => n > 0).reduce((s, n) => s + n, 0);
  const totalNegative = nets.filter((n) => n < 0).reduce((s, n) => s + n, 0);
  const seasonNet     = nets.reduce((s, n) => s + n, 0);

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Net Transfer Points per GW</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Click a bar to jump to that gameweek · green = gain, red = loss
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          {totalPositive > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-slate-500">+{totalPositive} gained</span>
            </span>
          )}
          {totalNegative < 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
              <span className="text-slate-500">{totalNegative} lost</span>
            </span>
          )}
          <span className={`font-bold tabular-nums ${seasonNet > 0 ? "text-emerald-600" : seasonNet < 0 ? "text-red-500" : "text-slate-400"}`}>
            Net: {seasonNet > 0 ? "+" : ""}{seasonNet}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={sorted}
            margin={{ top: 4, right: 12, left: -16, bottom: 0 }}
            barCategoryGap="22%"
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
              domain={[-bound, bound]}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tickFormatter={(v) => (v > 0 ? `+${v}` : `${v}`)}
            />
            <Tooltip content={<GwNetTooltip />} cursor={{ fill: "#f8fafc" }} />
            <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
            <Bar dataKey="gwNet" radius={[3, 3, 3, 3]} maxBarSize={44} style={{ cursor: "pointer" }}>
              {sorted.map((g, i) => {
                const isHighlighted = g.gw === highlightedGw;
                const colour = g.gwNet >= 0 ? "#10b981" : "#ef4444";
                return (
                  <Cell
                    key={i}
                    fill={colour}
                    opacity={highlightedGw === null || isHighlighted ? 1 : 0.35}
                    onClick={() => onBarClick(g.gw)}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  bboost:   "Bench Boost",
  "3xc":    "Triple Captain",
  freehit:  "Free Hit",
};

function NetBadge({ net, size = "md" }: { net: number; size?: "sm" | "md" | "lg" }) {
  const positive = net > 0;
  const zero     = net === 0;
  const colour   = positive
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : zero
    ? "bg-slate-100 text-slate-500 border-slate-200"
    : "bg-red-100 text-red-600 border-red-200";
  const sizeClass =
    size === "sm" ? "text-[10px] px-1.5 py-0.5" :
    size === "lg" ? "text-sm px-3 py-1.5 font-black" :
    "text-xs px-2 py-1";

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border font-semibold tabular-nums ${colour} ${sizeClass}`}>
      {net > 0 ? "+" : ""}{net} pts
    </span>
  );
}

// ── Transfer row ──────────────────────────────────────────────────────────────

function TransferRow({ t }: { t: RegretTransfer }) {
  return (
    <div className="flex items-center gap-2 py-2.5 flex-wrap sm:flex-nowrap">
      {/* OUT */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-red-400 w-7">OUT</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold text-slate-700">{t.playerOut.name}</span>
          <span
            className={`shrink-0 text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full border ${
              t.playerOut.pts >= t.playerIn.pts
                ? "bg-rose-100 text-rose-700 border-rose-200"
                : "bg-slate-100 text-slate-400 border-slate-200"
            }`}
          >
            {t.playerOut.pts} pts
          </span>
        </div>
      </div>

      {/* Arrow */}
      <svg
        className="shrink-0 text-slate-300"
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>

      {/* IN */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-emerald-500 w-6">IN</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold text-slate-700">{t.playerIn.name}</span>
          <span
            className={`shrink-0 text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full border ${
              t.playerIn.pts > t.playerOut.pts
                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                : "bg-slate-100 text-slate-400 border-slate-200"
            }`}
          >
            {t.playerIn.pts} pts
          </span>
        </div>
      </div>

      {/* Net */}
      <div className="shrink-0 ml-auto">
        <NetBadge net={t.net} size="sm" />
      </div>
    </div>
  );
}

// ── GW block ──────────────────────────────────────────────────────────────────

function GwBlock({ gw, highlighted }: { gw: RegretGw; highlighted?: boolean }) {
  const chip = gw.chipUsed ? CHIP_LABELS[gw.chipUsed] ?? gw.chipUsed : null;
  const netIsPositive = gw.gwNet > 0;
  const netIsNegative = gw.gwNet < 0;

  return (
    <div
      id={`gw-block-${gw.gw}`}
      className={`bg-white rounded-xl overflow-hidden shadow-card transition-all duration-300 ${
        highlighted
          ? "border-2 border-[#37003c] ring-2 ring-[#37003c]/20"
          : "border border-slate-200/80"
      }`}
    >
      {/* GW header */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-100 ${
          netIsPositive ? "bg-emerald-50/50" : netIsNegative ? "bg-red-50/40" : "bg-slate-50/60"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
            GW{gw.gw}
          </span>
          {chip && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 uppercase tracking-wide">
              {chip}
            </span>
          )}
          <span className="text-[10px] text-slate-400">
            {gw.transfers.length} transfer{gw.transfers.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {gw.hitCost < 0 && (
            <span className="text-[10px] font-semibold text-red-500 tabular-nums">
              Hit {gw.hitCost} pts
            </span>
          )}
          <NetBadge net={gw.gwNet} size="sm" />
        </div>
      </div>

      {/* Transfers */}
      <div className="px-4 divide-y divide-slate-50">
        {gw.transfers.map((t, i) => (
          <TransferRow key={i} t={t} />
        ))}
      </div>

      {/* Footer: verdict */}
      {gw.transfers.length > 0 && (
        <div className={`px-4 py-2 border-t border-slate-50 text-xs font-medium ${
          netIsPositive ? "text-emerald-600" : netIsNegative ? "text-red-500" : "text-slate-400"
        }`}>
          {netIsPositive
            ? `Net gain: +${gw.gwNet} pts — good week in the market`
            : netIsNegative
            ? `Regret: ${gw.gwNet} pts — the tinker hurt`
            : "Dead even — break-even week"}
        </div>
      )}
    </div>
  );
}

// ── Season summary bar ────────────────────────────────────────────────────────

function SeasonBar({ managers }: { managers: ManagerRegret[] }) {
  const max = Math.max(...managers.map((m) => Math.abs(m.seasonNet)), 1);
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <h2 className="text-sm font-semibold text-slate-700">Season Transfer Rankings</h2>
        <p className="text-xs text-slate-400 mt-0.5">Net pts gained or lost from all transfers this season</p>
      </div>
      <div className="divide-y divide-slate-50">
        {managers.map((m, i) => {
          const pct = Math.round((Math.abs(m.seasonNet) / max) * 100);
          const pos = m.seasonNet > 0;
          const neg = m.seasonNet < 0;
          return (
            <div key={m.managerId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-5 text-xs font-semibold text-slate-400 tabular-nums shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-800 truncate">{m.displayName}</span>
                  <NetBadge net={m.seasonNet} size="sm" />
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pos ? "bg-emerald-400" : neg ? "bg-red-400" : "bg-slate-300"
                    }`}
                    style={{ width: `${pct}%` }}
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

// ── Hall of Fame ──────────────────────────────────────────────────────────────

function HallOfFame({ managers }: { managers: ManagerRegret[] }) {
  const allBest = managers
    .filter((m) => m.bestTransfer)
    .map((m) => ({ m, t: m.bestTransfer! }))
    .sort((a, b) => b.t.net - a.t.net);

  const allWorst = managers
    .filter((m) => m.worstTransfer)
    .map((m) => ({ m, t: m.worstTransfer! }))
    .sort((a, b) => a.t.net - b.t.net);

  const overallBest  = allBest[0]  ?? null;
  const overallWorst = allWorst[0] ?? null;

  if (!overallBest && !overallWorst) return null;

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <h2 className="text-sm font-semibold text-slate-700">Hall of Fame · Season Extremes</h2>
        <p className="text-xs text-slate-400 mt-0.5">The single best and worst individual transfers of the season</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        {/* Best */}
        {overallBest && (
          <div className="px-4 py-4">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>🏆</span> Best Transfer
            </p>
            <p className="text-sm font-bold text-slate-800">{overallBest.m.displayName}</p>
            <p className="text-xs text-slate-400 mb-3">GW{overallBest.t.gw}</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-600">{overallBest.t.playerOut.name}</span>
              <span className="text-slate-300">({overallBest.t.playerOut.pts} pts)</span>
              <svg className="text-slate-300 shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <span className="font-semibold text-emerald-700">{overallBest.t.playerIn.name}</span>
              <span className="text-slate-400">({overallBest.t.playerIn.pts} pts)</span>
            </div>
            <div className="mt-2">
              <NetBadge net={overallBest.t.net} size="lg" />
            </div>
          </div>
        )}

        {/* Worst */}
        {overallWorst && (
          <div className="px-4 py-4">
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span>💀</span> Worst Transfer
            </p>
            <p className="text-sm font-bold text-slate-800">{overallWorst.m.displayName}</p>
            <p className="text-xs text-slate-400 mb-3">GW{overallWorst.t.gw}</p>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="font-medium text-slate-600">{overallWorst.t.playerOut.name}</span>
              <span className="text-slate-300">({overallWorst.t.playerOut.pts} pts)</span>
              <svg className="text-slate-300 shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <span className="font-semibold text-red-600">{overallWorst.t.playerIn.name}</span>
              <span className="text-slate-400">({overallWorst.t.playerIn.pts} pts)</span>
            </div>
            <div className="mt-2">
              <NetBadge net={overallWorst.t.net} size="lg" />
            </div>
          </div>
        )}
      </div>

      {/* Per-manager best/worst */}
      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/40">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Per Manager</p>
        <div className="space-y-2">
          {managers.filter((m) => m.bestTransfer || m.worstTransfer).map((m) => (
            <div key={m.managerId} className="flex items-center gap-3 flex-wrap text-xs">
              <span className="font-semibold text-slate-600 w-24 truncate shrink-0">{m.displayName}</span>
              {m.bestTransfer && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <span>↑</span>
                  <span>{m.bestTransfer.playerOut.name}→{m.bestTransfer.playerIn.name}</span>
                  <span className="font-bold">+{m.bestTransfer.net}</span>
                  <span className="text-slate-400">GW{m.bestTransfer.gw}</span>
                </span>
              )}
              {m.worstTransfer && m.worstTransfer.net < 0 && (
                <span className="flex items-center gap-1 text-red-500 ml-auto">
                  <span>↓</span>
                  <span>{m.worstTransfer.playerOut.name}→{m.worstTransfer.playerIn.name}</span>
                  <span className="font-bold">{m.worstTransfer.net}</span>
                  <span className="text-slate-400">GW{m.worstTransfer.gw}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegretPage() {
  const { data, isLoading, isError } = useQuery<RegretResponse>({
    queryKey: ["regret"],
    queryFn: async () => {
      const r = await fetch("/api/regret");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  const [selectedManager, setSelectedManager] = useState<number | null>(null);
  const [highlightedGw, setHighlightedGw]     = useState<number | null>(null);

  const managers = data?.managers ?? [];
  const activeId  = selectedManager ?? managers[0]?.managerId ?? null;
  const active    = managers.find((m) => m.managerId === activeId) ?? null;

  function handleBarClick(gw: number) {
    setHighlightedGw(gw);
    setTimeout(() => {
      document.getElementById(`gw-block-${gw}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    // Clear highlight after 2.5 s
    setTimeout(() => setHighlightedGw(null), 2500);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Transfer Regret Tracker</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Did your transfers actually pay off? Find out.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load transfer data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {data && managers.length > 0 && (
        <>
          {/* Season summary */}
          <SeasonBar managers={managers} />

          {/* Manager tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {managers.map((m) => {
              const isActive = m.managerId === activeId;
              const pos = m.seasonNet > 0;
              const neg = m.seasonNet < 0;
              return (
                <button
                  key={m.managerId}
                  onClick={() => { setSelectedManager(m.managerId); setHighlightedGw(null); }}
                  className={`shrink-0 flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all duration-150 ${
                    isActive
                      ? "bg-[#37003c] border-[#37003c] text-white shadow-md"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 shadow-card"
                  }`}
                >
                  <span className="text-xs font-semibold truncate max-w-[90px]">
                    {m.displayName}
                  </span>
                  <span
                    className={`text-[10px] font-bold tabular-nums mt-0.5 ${
                      isActive
                        ? pos ? "text-[#00ff87]" : neg ? "text-red-300" : "text-white/50"
                        : pos ? "text-emerald-600" : neg ? "text-red-500" : "text-slate-400"
                    }`}
                  >
                    {m.seasonNet > 0 ? "+" : ""}{m.seasonNet} pts
                  </span>
                </button>
              );
            })}
          </div>

          {/* Transfer log for selected manager */}
          {active && (
            <div className="space-y-3">
              {/* Manager summary strip */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-2 shadow-card text-xs">
                  <span className="text-slate-400">Season net</span>
                  <span className={`ml-2 font-bold tabular-nums ${active.seasonNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {active.seasonNet > 0 ? "+" : ""}{active.seasonNet} pts
                  </span>
                </div>
                {active.totalHitCost < 0 && (
                  <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-2 shadow-card text-xs">
                    <span className="text-slate-400">Total hits paid</span>
                    <span className="ml-2 font-bold tabular-nums text-red-500">{active.totalHitCost} pts</span>
                  </div>
                )}
                <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-2 shadow-card text-xs">
                  <span className="text-slate-400">Transfer GWs</span>
                  <span className="ml-2 font-bold tabular-nums text-slate-700">{active.gws.length}</span>
                </div>
              </div>

              {active.gws.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-xl px-4 py-10 text-center text-sm text-slate-400 shadow-card">
                  No transfers made yet this season.
                </div>
              ) : (
                <>
                  <GwNetChart
                    gws={active.gws}
                    highlightedGw={highlightedGw}
                    onBarClick={handleBarClick}
                  />
                  {active.gws.map((gw) => (
                    <GwBlock key={gw.gw} gw={gw} highlighted={gw.gw === highlightedGw} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Hall of Fame */}
          <HallOfFame managers={managers} />
        </>
      )}
    </div>
  );
}
