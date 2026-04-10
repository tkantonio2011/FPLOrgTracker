"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

interface Manager {
  managerId: number;
  displayName: string;
  data: { gw: number; position: number }[];
}

interface LeagueHistoryData {
  managers: Manager[];
  memberCount: number;
}

// Distinct colours that work on a white background
const COLOURS = [
  "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb",
  "#db2777", "#0891b2", "#65a30d", "#9333ea", "#ea580c",
  "#0d9488", "#be123c",
];

// Build recharts data: array of { gw, [managerId]: position }
function buildChartData(managers: Manager[], memberCount: number) {
  const gwSet = new Set<number>();
  for (const m of managers) for (const d of m.data) gwSet.add(d.gw);
  const gws = Array.from(gwSet).sort((a, b) => a - b);

  return gws.map((gw) => {
    const row: Record<string, number> = { gw };
    for (const m of managers) {
      const point = m.data.find((d) => d.gw === gw);
      if (point) row[String(m.managerId)] = point.position;
    }
    return row;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => a.value - b.value);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-1.5">GW{label}</p>
      {sorted.map((entry: { name: string; value: number; color: string }) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-slate-600">{entry.name}</span>
          </span>
          <span className="font-semibold text-slate-800 tabular-nums">#{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function LeaguePositionChart() {
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

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-card p-5">
        <div className="h-4 w-40 bg-slate-100 rounded animate-pulse mb-4" />
        <div className="h-56 bg-slate-50 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!data?.managers.length) return null;

  const chartData = buildChartData(data.managers, data.memberCount);
  if (chartData.length < 2) return null; // need at least 2 GWs to draw lines

  const totalManagers = data.memberCount;

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">League Position Over Time</h2>
        <p className="text-xs text-slate-400 mt-0.5">Org standings after each gameweek</p>
      </div>
      <div className="px-2 py-4">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="gw"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v) => `GW${v}`}
              interval="preserveStartEnd"
            />
            <YAxis
              reversed
              domain={[1, totalManagers]}
              ticks={Array.from({ length: totalManagers }, (_, i) => i + 1)}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v) => `#${v}`}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-slate-600">{value}</span>
              )}
            />
            {data.managers.map((m, i) => (
              <Line
                key={m.managerId}
                type="monotone"
                dataKey={String(m.managerId)}
                name={m.displayName}
                stroke={COLOURS[i % COLOURS.length]}
                strokeWidth={2}
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
