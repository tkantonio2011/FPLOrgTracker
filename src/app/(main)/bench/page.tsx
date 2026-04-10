"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// Distinct colours — same palette as league position chart
const COLOURS = [
  "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb",
  "#db2777", "#0891b2", "#65a30d", "#9333ea", "#ea580c",
  "#0d9488", "#be123c",
];

interface GwEntry {
  gw: number;
  benchPts: number;
  cumulative: number;
}

interface ManagerBench {
  managerId: number;
  displayName: string;
  teamName: string;
  totalBenchPts: number;
  gwData: GwEntry[];
  worstGw: { gw: number; benchPts: number } | null;
}

interface BenchResponse {
  managers: ManagerBench[];
  gameweeks: number[];
  currentGw: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CumulativeTooltip({ active, payload, label, managers }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a: { value: number }, b: { value: number }) => b.value - a.value);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-1.5">GW{label}</p>
      {sorted.map((entry: { dataKey: string; value: number; color: string }) => {
        const m = managers.find((mg: ManagerBench) => String(mg.managerId) === entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
              <span className="text-slate-600 truncate max-w-[90px]">{m?.displayName ?? entry.dataKey}</span>
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">{entry.value}pts</span>
          </div>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PerGwTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{payload[0]?.payload?.displayName}</p>
      <p className="text-slate-600">GW{label}: <span className="font-semibold text-slate-800">{payload[0]?.value} pts</span> on bench</p>
    </div>
  );
}

function buildCumulativeData(managers: ManagerBench[], gameweeks: number[]) {
  return gameweeks.map((gw) => {
    const row: Record<string, number | string> = { gw };
    for (const m of managers) {
      const entry = m.gwData.find((d) => d.gw === gw);
      if (entry) row[String(m.managerId)] = entry.cumulative;
    }
    return row;
  });
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function heatStyle(pts: number, max: number): { background: string; color: string } {
  if (pts === 0 || max === 0) return { background: "#f8fafc", color: "#cbd5e1" };
  const t = Math.min(pts / max, 1);
  // HSL: golden-yellow (45°) → orange (20°) → red (0°), saturated and darkening
  const hue   = Math.round(45 * (1 - t));
  const sat   = Math.round(80 + 18 * t);
  const light = Math.round(90 - 48 * t); // 90% (pale) → 42% (deep red)
  return {
    background: `hsl(${hue}, ${sat}%, ${light}%)`,
    color: t > 0.55 ? "#fff" : "#374151",
  };
}

function BenchHeatmap({
  managers,
  gameweeks,
}: {
  managers: ManagerBench[];
  gameweeks: number[];
}) {
  const [hoveredCell, setHoveredCell] = useState<{ managerId: number; gw: number } | null>(null);

  const maxPts = Math.max(
    ...managers.flatMap((m) => m.gwData.map((d) => d.benchPts)),
    1
  );

  // Pre-build managerId → gw → pts lookup
  const ptsByManagerGw = new Map(
    managers.map((m) => [m.managerId, new Map(m.gwData.map((d) => [d.gw, d.benchPts]))])
  );

  // GW totals (sum across all managers) — highlights painful org-wide GWs
  const gwOrgTotals = new Map(
    gameweeks.map((gw) => [
      gw,
      managers.reduce((s, m) => s + (ptsByManagerGw.get(m.managerId)?.get(gw) ?? 0), 0),
    ])
  );
  const maxGwTotal = Math.max(...Array.from(gwOrgTotals.values()), 1);

  // Legend steps
  const legendSteps = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Bench Points Heatmap</h2>
          <p className="text-xs text-slate-400 mt-0.5">Each cell = bench pts that GW — darker = more wasted</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">0</span>
          <div className="flex rounded overflow-hidden h-3 w-20">
            {legendSteps.map((t, i) => (
              <div
                key={i}
                className="flex-1"
                style={t === 0 ? { background: "#f1f5f9" } : { background: `hsl(${Math.round(45*(1-t))}, ${Math.round(80+18*t)}%, ${Math.round(90-48*t)}%)` }}
              />
            ))}
          </div>
          <span className="text-[10px] text-slate-400">{maxPts}pts</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto px-4 py-3">
        <div className="min-w-max space-y-px">

          {/* GW header row */}
          <div className="flex items-end gap-px">
            <div className="shrink-0 w-28" /> {/* name column spacer */}
            {gameweeks.map((gw) => {
              const orgTotal = gwOrgTotals.get(gw) ?? 0;
              const isHot = orgTotal / maxGwTotal > 0.6;
              return (
                <div
                  key={gw}
                  className="w-6 text-center shrink-0"
                  title={`GW${gw} org total: ${orgTotal} bench pts`}
                >
                  <span className={`text-[9px] font-semibold ${isHot ? "text-red-400" : "text-slate-300"}`}>
                    {gw}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Manager rows */}
          {managers.map((m) => {
            const gwMap = ptsByManagerGw.get(m.managerId)!;
            return (
              <div key={m.managerId} className="flex items-center gap-px">
                {/* Name */}
                <div className="shrink-0 w-28 pr-2">
                  <span className="text-xs font-medium text-slate-700 truncate block">
                    {m.displayName.split(" ")[0]}
                  </span>
                </div>

                {/* Cells */}
                {gameweeks.map((gw) => {
                  const pts = gwMap.get(gw) ?? 0;
                  const style = heatStyle(pts, maxPts);
                  const isHovered =
                    hoveredCell?.managerId === m.managerId && hoveredCell?.gw === gw;
                  const isWorst = m.worstGw?.gw === gw;

                  return (
                    <div
                      key={gw}
                      className="w-6 h-7 shrink-0 flex items-center justify-center rounded-[3px] text-[9px] font-bold tabular-nums cursor-default select-none transition-transform duration-75"
                      style={{
                        ...style,
                        outline: isWorst ? "2px solid #dc2626" : isHovered ? "2px solid #64748b" : "none",
                        outlineOffset: "-1px",
                        transform: isHovered ? "scale(1.15)" : "none",
                        zIndex: isHovered ? 10 : "auto",
                        position: "relative",
                      }}
                      title={`${m.displayName} · GW${gw}: ${pts} bench pts${isWorst ? " (season worst)" : ""}`}
                      onMouseEnter={() => setHoveredCell({ managerId: m.managerId, gw })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {pts > 0 ? pts : ""}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Org total row */}
          <div className="flex items-center gap-px mt-1 pt-1 border-t border-slate-100">
            <div className="shrink-0 w-28 pr-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Org total</span>
            </div>
            {gameweeks.map((gw) => {
              const total = gwOrgTotals.get(gw) ?? 0;
              const t = total / maxGwTotal;
              const bg = t > 0.7 ? "#fecaca" : t > 0.4 ? "#fed7aa" : "#f1f5f9";
              const fg = t > 0.7 ? "#dc2626" : t > 0.4 ? "#c2410c" : "#94a3b8";
              return (
                <div
                  key={gw}
                  className="w-6 h-5 shrink-0 flex items-center justify-center rounded-[3px] text-[9px] font-bold tabular-nums"
                  style={{ background: bg, color: fg }}
                  title={`GW${gw} org total: ${total} bench pts`}
                >
                  {total > 0 ? total : ""}
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* Footer note */}
      <div className="px-5 py-2 border-t border-slate-50 text-[10px] text-slate-400 flex items-center gap-3">
        <span>Red outline = each manager&apos;s personal worst GW</span>
        <span className="text-slate-200">·</span>
        <span>Red GW numbers = painful week org-wide</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BenchPage() {
  const [view, setView] = useState<"cumulative" | "pergw">("cumulative");
  const [selectedManager, setSelectedManager] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<BenchResponse>({
    queryKey: ["bench"],
    queryFn: async () => {
      const r = await fetch("/api/bench");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  const cumulativeData = data ? buildCumulativeData(data.managers, data.gameweeks) : [];

  const totalSeasonBench = data?.managers.reduce((s, m) => s + m.totalBenchPts, 0) ?? 0;
  const mostWasteful = data?.managers[0];
  const leastWasteful = data?.managers[data.managers.length - 1];

  // Find the single worst GW across all managers
  const globalWorstGw = data?.managers.reduce<{ manager: string; gw: number; pts: number } | null>((best, m) => {
    if (!m.worstGw) return best;
    if (!best || m.worstGw.benchPts > best.pts) {
      return { manager: m.displayName, gw: m.worstGw.gw, pts: m.worstGw.benchPts };
    }
    return best;
  }, null);

  // Per-GW bar chart data for selected manager
  const selectedM = data?.managers.find((m) => m.managerId === selectedManager) ?? data?.managers[0];
  const perGwData = selectedM?.gwData.map((d) => ({
    gw: d.gw,
    benchPts: d.benchPts,
    displayName: selectedM.displayName,
  })) ?? [];

  const maxBenchPts = data ? Math.max(...data.managers.map((m) => m.totalBenchPts), 1) : 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bench Points Wasted</h1>
        <p className="text-sm text-slate-400 mt-0.5">Season running total of points left on the bench</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
            ))}
          </div>
          <div className="h-64 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load bench data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="Total wasted (org)"
              value={`${totalSeasonBench} pts`}
              sub={`across ${data.gameweeks.length} gameweeks`}
            />
            <SummaryCard
              label="Most wasteful"
              value={mostWasteful?.displayName ?? "—"}
              sub={mostWasteful ? `${mostWasteful.totalBenchPts} pts wasted` : undefined}
              danger
            />
            <SummaryCard
              label="Most efficient"
              value={leastWasteful?.displayName ?? "—"}
              sub={leastWasteful ? `${leastWasteful.totalBenchPts} pts wasted` : undefined}
              highlight
            />
            <SummaryCard
              label="Worst single GW"
              value={globalWorstGw ? `GW${globalWorstGw.gw}` : "—"}
              sub={globalWorstGw ? `${globalWorstGw.manager} (${globalWorstGw.pts} pts)` : undefined}
            />
          </div>

          {/* Leaderboard */}
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Season Leaderboard</h2>
              <span className="text-xs text-slate-400">Most → least wasted</span>
            </div>
            <div className="divide-y divide-slate-50">
              {data.managers.map((m, idx) => {
                const colour = COLOURS[idx % COLOURS.length];
                const barPct = Math.round((m.totalBenchPts / maxBenchPts) * 100);
                const isFirst = idx === 0;
                const isLast = idx === data.managers.length - 1;

                return (
                  <div key={m.managerId} className={`px-4 sm:px-5 py-3.5 ${isFirst ? "bg-red-50/40" : isLast ? "bg-emerald-50/30" : ""}`}>
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <span className="w-6 text-sm font-bold text-slate-400 shrink-0 tabular-nums">
                        {idx + 1}
                      </span>

                      {/* Name + bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold text-slate-800 truncate">{m.displayName}</span>
                            {isFirst && (
                              <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                                Bench king
                              </span>
                            )}
                            {isLast && (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                                Most efficient
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {m.worstGw && (
                              <span className="hidden sm:block text-xs text-slate-400">
                                Worst: <span className="font-medium text-slate-600">GW{m.worstGw.gw} ({m.worstGw.benchPts}pts)</span>
                              </span>
                            )}
                            <span className="text-base font-black text-slate-800 tabular-nums">
                              {m.totalBenchPts}
                              <span className="text-xs font-normal text-slate-400 ml-0.5">pts</span>
                            </span>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barPct}%`, background: colour }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Heatmap */}
          {data.gameweeks.length >= 1 && (
            <BenchHeatmap managers={data.managers} gameweeks={data.gameweeks} />
          )}

          {/* Chart section */}
          {data.gameweeks.length >= 2 && (
            <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-slate-700">
                  {view === "cumulative" ? "Cumulative Bench Points" : "Per-Gameweek Bench Points"}
                </h2>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setView("cumulative")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
                      view === "cumulative"
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Cumulative
                  </button>
                  <button
                    onClick={() => setView("pergw")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
                      view === "pergw"
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Per GW
                  </button>
                </div>
              </div>

              <div className="p-4">
                {view === "cumulative" ? (
                  <>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={cumulativeData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="gw"
                          tickFormatter={(v) => `GW${v}`}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CumulativeTooltip managers={data.managers} />} />
                        {data.managers.map((m, idx) => (
                          <Line
                            key={m.managerId}
                            type="monotone"
                            dataKey={String(m.managerId)}
                            stroke={COLOURS[idx % COLOURS.length]}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                    {/* Colour legend */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-1">
                      {data.managers.map((m, idx) => (
                        <div key={m.managerId} className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: COLOURS[idx % COLOURS.length] }}
                          />
                          <span className="text-xs text-slate-500 truncate max-w-[80px]">{m.displayName}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Manager picker */}
                    <div className="flex items-center gap-2 mb-4">
                      <label className="text-xs font-medium text-slate-500 shrink-0">Manager</label>
                      <div className="relative">
                        <select
                          value={selectedM?.managerId ?? ""}
                          onChange={(e) => setSelectedManager(parseInt(e.target.value))}
                          className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 bg-white cursor-pointer shadow-sm"
                        >
                          {data.managers.map((m) => (
                            <option key={m.managerId} value={m.managerId}>
                              {m.displayName}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                            <path d="m6 9 6 6 6-6"/>
                          </svg>
                        </div>
                      </div>
                      {selectedM && (
                        <span className="text-xs text-slate-400 ml-1">
                          Total: <strong className="text-slate-700">{selectedM.totalBenchPts} pts</strong>
                        </span>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={perGwData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="gw"
                          tickFormatter={(v) => `GW${v}`}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<PerGwTooltip />} />
                        <Bar dataKey="benchPts" radius={[3, 3, 0, 0]}>
                          {perGwData.map((entry, idx) => {
                            const mIdx = data.managers.findIndex((m) => m.displayName === entry.displayName);
                            const baseColour = COLOURS[mIdx % COLOURS.length];
                            // Highlight the worst GW
                            const isWorst = selectedM?.worstGw?.gw === entry.gw;
                            return (
                              <Cell
                                key={`cell-${idx}`}
                                fill={isWorst ? "#dc2626" : baseColour}
                                opacity={isWorst ? 1 : 0.75}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {selectedM?.worstGw && (
                      <p className="text-xs text-slate-400 mt-2 text-center">
                        Worst GW highlighted in red —{" "}
                        <span className="font-semibold text-red-600">
                          GW{selectedM.worstGw.gw}: {selectedM.worstGw.benchPts} pts
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Hall of Shame — worst GW per manager */}
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
              <h2 className="text-sm font-semibold text-slate-700">Hall of Shame</h2>
              <p className="text-xs text-slate-400 mt-0.5">Each manager&apos;s single most painful gameweek</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-slate-100">
              {data.managers.map((m, idx) => (
                <div key={m.managerId} className="bg-white px-4 py-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: COLOURS[idx % COLOURS.length] }}
                    />
                    <p className="text-xs font-semibold text-slate-700 truncate">{m.displayName}</p>
                  </div>
                  {m.worstGw ? (
                    <>
                      <p className="text-2xl font-black text-red-600 tabular-nums leading-none">
                        {m.worstGw.benchPts}
                        <span className="text-sm font-normal text-slate-400 ml-0.5">pts</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-1">GW{m.worstGw.gw}</p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">No data</p>
                  )}
                </div>
              ))}
            </div>
          </div>
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
    ? "bg-emerald-50 border-emerald-200"
    : "bg-white border-slate-200/80";
  const valueColour = danger ? "text-red-600" : highlight ? "text-emerald-700" : "text-slate-900";

  return (
    <div className={`rounded-xl px-4 py-3.5 border ${bg} shadow-card`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-base font-black truncate ${valueColour}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
