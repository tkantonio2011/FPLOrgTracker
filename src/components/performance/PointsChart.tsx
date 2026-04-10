"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Dot,
} from "recharts";

interface PointsChartProps {
  history: {
    gameweekId: number;
    points: number;
    totalPoints: number;
    globalAvgPoints: number | null;
    chipUsed: string | null;
  }[];
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: {
    gameweekId: number;
    points: number;
    chipUsed: string | null;
  };
}

function MemberDot(props: CustomDotProps) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;

  if (payload?.chipUsed) {
    return <Dot cx={cx} cy={cy} r={6} fill="#00ff87" stroke="#37003c" strokeWidth={2} />;
  }

  return <Dot cx={cx} cy={cy} r={3} fill="#37003c" stroke="#37003c" />;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-card-md px-3.5 py-2.5 text-sm">
      <p className="font-semibold text-slate-700 mb-1.5 tabular">GW {label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center justify-between gap-4" style={{ color: entry.color }}>
          <span className="text-slate-500">{entry.name}</span>
          <span className="font-bold tabular">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export function PointsChart({ history }: PointsChartProps) {
  const data = history.map((h) => ({
    gameweekId: h.gameweekId,
    points: h.points,
    globalAvg: h.globalAvgPoints,
    chipUsed: h.chipUsed,
  }));

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="gameweekId"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }} />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "12px", color: "#64748b" }}
          />
          <Line
            type="monotone"
            dataKey="points"
            name="Your Points"
            stroke="#37003c"
            strokeWidth={2.5}
            dot={<MemberDot />}
            activeDot={{ r: 5, fill: "#37003c", stroke: "#fff", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="globalAvg"
            name="Global Avg"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 4, fill: "#94a3b8" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
