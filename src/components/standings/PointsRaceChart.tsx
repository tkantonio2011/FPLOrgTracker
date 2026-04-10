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
  Legend,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManagerSeries {
  managerId: number;
  displayName: string;
  data: { gw: number; position: number; totalPoints: number }[];
}

interface LeagueHistoryData {
  managers: ManagerSeries[];
  memberCount: number;
}

// ── Colours (same palette as LeaguePositionChart) ─────────────────────────────

const COLOURS = [
  "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb",
  "#db2777", "#0891b2", "#65a30d", "#9333ea", "#ea580c",
  "#0d9488", "#be123c",
];

// ── Chart data builder ────────────────────────────────────────────────────────

function buildChartData(managers: ManagerSeries[]) {
  const gwSet = new Set<number>();
  for (const m of managers) for (const d of m.data) gwSet.add(d.gw);
  const gws = Array.from(gwSet).sort((a, b) => a - b);

  return gws.map((gw) => {
    const row: Record<string, number> = { gw };
    for (const m of managers) {
      const point = m.data.find((d) => d.gw === gw);
      if (point) row[String(m.managerId)] = point.totalPoints;
    }
    return row;
  });
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, managers, colourMap }: any) {
  if (!active || !payload?.length) return null;

  // Sort by pts descending (leader first)
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  const leader = sorted[0];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-600 mb-2">GW{label}</p>
      {sorted.map((entry: { name: string; value: number; dataKey: string }, idx: number) => {
        const managerId = entry.dataKey;
        const m = (managers as ManagerSeries[]).find(
          (mg) => String(mg.managerId) === managerId
        );
        const firstName = m?.displayName.split(" ")[0] ?? entry.name;
        const isLeading = idx === 0;
        const gap = leader.value - entry.value;
        return (
          <div key={managerId} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: colourMap[managerId] }}
              />
              <span className={`truncate ${isLeading ? "font-semibold text-slate-800" : "text-slate-500"}`}>
                {firstName}
              </span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0 tabular-nums">
              <span className={`font-bold ${isLeading ? "text-slate-900" : "text-slate-600"}`}>
                {entry.value}
              </span>
              {!isLeading && (
                <span className="text-[10px] text-red-400 font-medium">−{gap}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PointsRaceChart({ currentGw }: { currentGw?: number }) {
  const { data, isLoading } = useQuery<LeagueHistoryData>({
    queryKey: ["league-history"],
    queryFn: () =>
      fetch("/api/league-history").then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw json;
        return json;
      }),
    staleTime: 300_000,
    retry: false,
  });

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-card overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <div className="h-4 w-44 bg-slate-100 rounded animate-pulse mb-1" />
          <div className="h-3 w-64 bg-slate-50 rounded animate-pulse" />
        </div>
        <div className="px-4 pb-4 pt-2">
          <div className="h-64 bg-slate-50 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data?.managers.length) return null;

  const chartData = buildChartData(data.managers);
  if (chartData.length < 2) return null;

  // Map managerId → colour for tooltip
  const colourMap: Record<string, string> = {};
  data.managers.forEach((m, i) => {
    colourMap[String(m.managerId)] = COLOURS[i % COLOURS.length];
  });

  // Find the leader (highest pts in latest GW) to give their line a slight highlight
  const lastRow = chartData[chartData.length - 1];
  const leaderId = data.managers.reduce((best, m) => {
    const pts = lastRow[String(m.managerId)] ?? 0;
    const bestPts = lastRow[String(best.managerId)] ?? 0;
    return pts > bestPts ? m : best;
  }, data.managers[0]);

  // Y-axis domain with a little breathing room
  const allPts = chartData.flatMap((row) =>
    data.managers.map((m) => row[String(m.managerId)] ?? null).filter(Boolean) as number[]
  );
  const minPts = Math.min(...allPts);
  const maxPts = Math.max(...allPts);
  const pad = Math.round((maxPts - minPts) * 0.08);
  const yMin = Math.max(0, minPts - pad);
  const yMax = maxPts + pad;

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Season Points Race</h2>
          <p className="text-xs text-slate-400 mt-0.5">Cumulative total points after each gameweek</p>
        </div>
        {currentGw && (
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full tabular-nums">
            GW{currentGw}
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="px-1 pb-4">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 20, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="gw"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v) => `GW${v}`}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v) => String(v)}
            />
            <Tooltip
              content={
                <CustomTooltip
                  managers={data.managers}
                  colourMap={colourMap}
                />
              }
              cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
            />

            {/* Current GW reference line */}
            {currentGw && chartData.some((d) => d.gw === currentGw) && (
              <ReferenceLine
                x={currentGw}
                stroke="#cbd5e1"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{
                  value: `GW${currentGw}`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#94a3b8",
                  dy: -4,
                }}
              />
            )}

            {data.managers.map((m, i) => {
              const isLeader = m.managerId === leaderId.managerId;
              return (
                <Line
                  key={m.managerId}
                  type="monotone"
                  dataKey={String(m.managerId)}
                  name={m.displayName}
                  stroke={COLOURS[i % COLOURS.length]}
                  strokeWidth={isLeader ? 2.5 : 1.75}
                  dot={false}
                  activeDot={{
                    r: 4,
                    strokeWidth: 0,
                    fill: COLOURS[i % COLOURS.length],
                  }}
                  connectNulls
                />
              );
            })}

            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ paddingTop: 12, paddingLeft: 8 }}
              formatter={(value: string) => (
                <span style={{ fontSize: 11, color: "#64748b" }}>{value}</span>
              )}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
