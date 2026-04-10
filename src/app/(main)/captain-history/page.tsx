"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// Colour palette — same as bench/chart pages
const COLOURS = [
  "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb",
  "#db2777", "#0891b2", "#65a30d", "#9333ea", "#ea580c",
  "#0d9488", "#be123c",
];

interface GwRecord {
  gw: number;
  captainId: number;
  captainName: string;
  rawPoints: number | null;
  multiplier: 2 | 3;
  bonusPts: number | null;
  chipUsed: "TC" | null;
}

interface ManagerCaptain {
  managerId: number;
  displayName: string;
  teamName: string;
  avgCaptainPts: number;
  totalCaptainPts: number;
  gwsWithCaptain: number;
  blanks: number;
  bestGw: { gw: number; captainName: string; pts: number } | null;
  worstGw: { gw: number; captainName: string; pts: number } | null;
  gwData: (GwRecord | null)[];
}

interface CaptainResponse {
  managers: ManagerCaptain[];
  gameweeks: number[];
  currentGw: number;
}

// ── Cumulative captain pts chart ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CumulativeTooltip({ active, payload, label, managers }: any) {
  if (!active || !payload?.length) return null;

  // Rebuild sorted list from payload
  const entries: { name: string; value: number; colour: string }[] = payload
    .map((p: any) => ({ name: p.name, value: p.value as number, colour: p.stroke }))
    .sort((a: any, b: any) => b.value - a.value);

  const leader = entries[0];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[180px]">
      <p className="font-semibold text-slate-600 mb-2">GW{label}</p>
      {entries.map((e, i) => (
        <div key={e.name} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-600 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.colour }} />
            <span className="truncate">{e.name}</span>
          </span>
          <span className="font-bold tabular-nums text-slate-800 shrink-0">
            {e.value}
            {i > 0 && (
              <span className="text-slate-400 font-normal ml-1">−{leader.value - e.value}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function CumulativeCaptainChart({
  managers,
  gameweeks,
  currentGw,
}: {
  managers: ManagerCaptain[];
  gameweeks: number[];
  currentGw: number;
}) {
  // Build cumulative running totals per manager per GW
  const running: Record<number, number> = {};
  managers.forEach((m) => (running[m.managerId] = 0));

  const chartData = gameweeks.map((gw) => {
    const row: Record<string, unknown> = { gw };
    managers.forEach((m) => {
      const rec = m.gwData.find((r) => r?.gw === gw);
      running[m.managerId] += rec?.rawPoints ?? 0;
      row[String(m.managerId)] = running[m.managerId];
    });
    return row;
  });

  // Leader = manager with most cumulative pts at latest GW
  const lastRow = chartData[chartData.length - 1];
  const leaderId = managers.reduce(
    (best, m) =>
      ((lastRow?.[String(m.managerId)] as number) ?? 0) >
      ((lastRow?.[String(best?.managerId)] as number) ?? 0)
        ? m
        : best,
    managers[0]
  )?.managerId;

  // Y-axis domain
  const allVals = chartData.flatMap((row) =>
    managers.map((m) => (row[String(m.managerId)] as number) ?? 0)
  );
  const yMax = Math.max(...allVals, 1);
  const yMin = Math.min(...allVals, 0);
  const pad = Math.ceil((yMax - yMin) * 0.08);

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Cumulative Captain Points</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Running total of raw captain points across the season
          </p>
        </div>
        {/* Colour legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 shrink-0">
          {managers.map((m, idx) => (
            <span key={m.managerId} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span
                className="w-5 shrink-0"
                style={{
                  display: "inline-block",
                  height: m.managerId === leaderId ? 2.5 : 1.75,
                  background: COLOURS[idx % COLOURS.length],
                  borderRadius: 2,
                  verticalAlign: "middle",
                }}
              />
              {m.displayName}
              <span className="font-semibold text-slate-700 tabular-nums">
                {m.totalCaptainPts}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 16, left: -16, bottom: 0 }}
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
              domain={[Math.max(0, yMin - pad), yMax + pad]}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={
                <CumulativeTooltip managers={managers} />
              }
              cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
            />
            <ReferenceLine
              x={currentGw}
              stroke="#cbd5e1"
              strokeDasharray="4 2"
              strokeWidth={1.5}
            />
            {managers.map((m, idx) => (
              <Line
                key={m.managerId}
                type="monotone"
                dataKey={String(m.managerId)}
                name={m.displayName}
                stroke={COLOURS[idx % COLOURS.length]}
                strokeWidth={m.managerId === leaderId ? 2.5 : 1.75}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Colour cell by pts relative to others in the same GW row ─────────────────
function cellBg(pts: number | null, allPts: (number | null)[]): string {
  if (pts === null) return "";
  const valid = allPts.filter((p): p is number => p !== null);
  if (valid.length === 0) return "";
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  if (pts === max && max !== min) return "bg-emerald-50 text-emerald-700";
  if (pts === min && max !== min) return "bg-red-50 text-red-600";
  return "";
}

export default function CaptainHistoryPage() {
  const { data, isLoading, isError } = useQuery<CaptainResponse>({
    queryKey: ["captain-history"],
    queryFn: async () => {
      const r = await fetch("/api/captain-history");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  const maxAvg = data ? Math.max(...data.managers.map((m) => m.avgCaptainPts), 1) : 1;

  // Build a lookup: managerId → gwRecord for a given GW
  function getRecord(m: ManagerCaptain, gw: number): GwRecord | null {
    return m.gwData.find((r) => r?.gw === gw) ?? null;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Captain History</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Who each manager captained each week and their running efficiency
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
            ))}
          </div>
          <div className="h-40 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
          <div className="h-64 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load captain history. The FPL API may be temporarily unavailable.
        </div>
      )}

      {data && data.managers.length > 0 && (
        <>
          {/* ── Efficiency leaderboard ── */}
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Captain Efficiency Ranking</h2>
                <p className="text-xs text-slate-400 mt-0.5">Average raw captain points per gameweek</p>
              </div>
              <span className="text-xs text-slate-400">Best → worst</span>
            </div>

            <div className="divide-y divide-slate-50">
              {data.managers.map((m, idx) => {
                const colour = COLOURS[idx % COLOURS.length];
                const barPct = Math.round((m.avgCaptainPts / maxAvg) * 100);
                const isFirst = idx === 0;
                const isLast = idx === data.managers.length - 1;

                return (
                  <div
                    key={m.managerId}
                    className={`px-4 sm:px-5 py-3.5 ${isFirst ? "bg-emerald-50/40" : isLast ? "bg-red-50/30" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-sm font-bold text-slate-400 shrink-0 tabular-nums">
                        {idx + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        {/* Name row */}
                        <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold text-slate-800 truncate">{m.displayName}</span>
                            {isFirst && (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                                Best captain
                              </span>
                            )}
                            {isLast && (
                              <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                                Worst captain
                              </span>
                            )}
                          </div>

                          {/* Stats cluster */}
                          <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
                            {m.blanks > 0 && (
                              <span className="hidden sm:block">
                                <span className="font-semibold text-red-500">{m.blanks}</span> blank{m.blanks !== 1 ? "s" : ""}
                              </span>
                            )}
                            {m.bestGw && (
                              <span className="hidden sm:block">
                                Best: <span className="font-semibold text-slate-700">GW{m.bestGw.gw} {m.bestGw.captainName} ({m.bestGw.pts}pts)</span>
                              </span>
                            )}
                            <div className="text-right">
                              <span className="text-lg font-black text-slate-800 tabular-nums">
                                {m.avgCaptainPts}
                              </span>
                              <span className="text-xs font-normal text-slate-400 ml-0.5">avg</span>
                            </div>
                          </div>
                        </div>

                        {/* Bar */}
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

            {/* Footer totals */}
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 flex flex-wrap gap-x-6 gap-y-1">
              {data.managers.map((m, idx) => (
                <span key={m.managerId} className="text-xs text-slate-400">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1 relative top-px"
                    style={{ background: COLOURS[idx % COLOURS.length] }}
                  />
                  {m.displayName}:{" "}
                  <span className="font-semibold text-slate-600 tabular-nums">
                    {m.totalCaptainPts}pts total
                  </span>
                  {m.blanks > 0 && (
                    <span className="text-red-400 ml-1">({m.blanks} blank{m.blanks !== 1 ? "s" : ""})</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* ── Cumulative line chart ── */}
          <CumulativeCaptainChart
            managers={data.managers}
            gameweeks={data.gameweeks}
            currentGw={data.currentGw}
          />

          {/* ── Per-GW grid table ── */}
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
              <h2 className="text-sm font-semibold text-slate-700">Gameweek-by-Gameweek</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Green = best captain that GW · Red = worst ·{" "}
                <span className="font-semibold">TC</span> = Triple Captain
              </p>
            </div>

            {/* Scrollable grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-max">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide border-r border-slate-100 min-w-[3rem]">
                      GW
                    </th>
                    {data.managers.map((m, idx) => (
                      <th
                        key={m.managerId}
                        className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap min-w-[110px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: COLOURS[idx % COLOURS.length] }}
                          />
                          {m.displayName}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.gameweeks.map((gw) => {
                    // Gather all rawPoints for this GW row (for colour coding)
                    const rowPts = data.managers.map((m) => getRecord(m, gw)?.rawPoints ?? null);

                    return (
                      <tr key={gw} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-bold text-slate-600 border-r border-slate-100 tabular-nums">
                          {gw}
                        </td>
                        {data.managers.map((m, mIdx) => {
                          const rec = getRecord(m, gw);
                          const bg = cellBg(rec?.rawPoints ?? null, rowPts);

                          if (!rec) {
                            return (
                              <td key={m.managerId} className="px-3 py-2.5 text-slate-300">
                                —
                              </td>
                            );
                          }

                          return (
                            <td
                              key={m.managerId}
                              className={`px-3 py-2.5 ${bg}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-semibold text-slate-700 truncate max-w-[60px]" title={rec.captainName}>
                                  {rec.captainName}
                                </span>
                                {rec.chipUsed && (
                                  <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1 py-0.5 rounded shrink-0">
                                    TC
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span
                                  className={`font-black tabular-nums ${
                                    rec.rawPoints === null
                                      ? "text-slate-300"
                                      : rec.rawPoints <= 2
                                      ? "text-red-500"
                                      : rec.rawPoints >= 12
                                      ? "text-emerald-600"
                                      : "text-slate-700"
                                  }`}
                                >
                                  {rec.rawPoints ?? "?"}
                                </span>
                                <span className="text-slate-400">pts</span>
                                {rec.rawPoints !== null && rec.multiplier === 3 && (
                                  <span className="text-[9px] text-purple-500 font-bold">
                                    ×3
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Averages footer row */}
                  <tr className="bg-slate-50/60 border-t border-slate-200">
                    <td className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 font-bold text-slate-500 border-r border-slate-100 uppercase text-[10px] tracking-wide">
                      Avg
                    </td>
                    {data.managers.map((m) => (
                      <td key={m.managerId} className="px-3 py-2.5">
                        <span className="font-black text-slate-700 tabular-nums">{m.avgCaptainPts}</span>
                        <span className="text-slate-400 ml-0.5">pts</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Hall of fame / shame ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Best captain moments */}
            <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
              <div className="px-4 py-3 border-b border-slate-100 bg-emerald-50/60">
                <h2 className="text-sm font-semibold text-emerald-800">Best Captain Moments</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {[...data.managers]
                  .filter((m) => m.bestGw)
                  .sort((a, b) => (b.bestGw!.pts) - (a.bestGw!.pts))
                  .map((m, idx) => (
                    <div key={m.managerId} className="px-4 py-3 flex items-center gap-3">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          background: COLOURS[data.managers.findIndex((mg) => mg.managerId === m.managerId) % COLOURS.length],
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{m.displayName}</p>
                        <p className="text-xs text-slate-400">
                          GW{m.bestGw!.gw} — {m.bestGw!.captainName}
                        </p>
                      </div>
                      <span className="text-base font-black text-emerald-600 tabular-nums shrink-0">
                        {m.bestGw!.pts}pts
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Worst captain moments */}
            <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
              <div className="px-4 py-3 border-b border-slate-100 bg-red-50/60">
                <h2 className="text-sm font-semibold text-red-800">Worst Captain Moments</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {[...data.managers]
                  .filter((m) => m.worstGw)
                  .sort((a, b) => (a.worstGw!.pts) - (b.worstGw!.pts))
                  .map((m) => (
                    <div key={m.managerId} className="px-4 py-3 flex items-center gap-3">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          background: COLOURS[data.managers.findIndex((mg) => mg.managerId === m.managerId) % COLOURS.length],
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{m.displayName}</p>
                        <p className="text-xs text-slate-400">
                          GW{m.worstGw!.gw} — {m.worstGw!.captainName}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-base font-black tabular-nums ${m.worstGw!.pts <= 2 ? "text-red-600" : "text-slate-600"}`}>
                          {m.worstGw!.pts}pts
                        </span>
                        {m.worstGw!.pts <= 2 && (
                          <p className="text-[9px] text-red-400 font-bold uppercase tracking-wide">blank</p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}

      {data && data.managers.length === 0 && !isLoading && (
        <div className="bg-white border border-slate-200/80 rounded-xl px-5 py-10 text-center text-sm text-slate-400 shadow-card">
          No captain data yet. Scores appear once the first gameweek completes.
        </div>
      )}
    </div>
  );
}
