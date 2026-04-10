"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgonyBreakdown {
  benchPts: number;
  captainPain: number;
  hitCost: number;
  gwSuffering: number;
  totalAgony: number;
}

interface AgonyManager {
  managerId: number;
  displayName: string;
  teamName: string;
  breakdown: AgonyBreakdown;
  rank: number;
  captainBlanks: number;
  worstGw: { gw: number; pts: number; orgWinner: number } | null;
}

interface AgonyResponse {
  managers: AgonyManager[];
  currentGw: number;
}

// ── Flavour text ──────────────────────────────────────────────────────────────

function flavourText(m: AgonyManager, isFirst: boolean, isLast: boolean): string {
  const { breakdown: b, captainBlanks } = m;
  if (isFirst) {
    if (b.captainPain > 20) return "The universe is specifically targeting this person.";
    if (b.benchPts > 200)   return "The bench is carrying more points than the starting XI.";
    if (b.hitCost > 30)     return "Taking hits like it's a negotiating strategy.";
    return "A perfect storm of FPL misfortune. Statistically improbable. Yet here we are.";
  }
  if (isLast) return "Cushioned by luck, protected by the algorithm. They don't deserve it.";
  if (captainBlanks >= 4)  return `${captainBlanks} captain blanks. The armband is cursed.`;
  if (b.benchPts > 150)    return "The bench could've won this league. Tragically.";
  if (b.gwSuffering > 400) return "Consistently behind. A slow-motion collapse.";
  if (b.hitCost > 20)      return "The transfer market is not this person's friend.";
  return "Quietly suffering. Stoic. Probably fine. (Not fine.)";
}

// ── Component breakdown bar ───────────────────────────────────────────────────

const COMPONENTS: {
  key: keyof AgonyBreakdown;
  label: string;
  colour: string;
  title: string;
}[] = [
  { key: "gwSuffering",  label: "GW Suffering",    colour: "bg-violet-500", title: "Sum of pts behind the org GW winner each week" },
  { key: "benchPts",     label: "Bench Waste",      colour: "bg-amber-500",  title: "Total pts left on the bench all season" },
  { key: "hitCost",      label: "Transfer Hits",    colour: "bg-red-500",    title: "Total pts lost to transfer hits" },
  { key: "captainPain",  label: "Captain Blanks",   colour: "bg-rose-400",   title: "Captain pts × 2 for GWs where captain scored ≤ 2" },
];

// Hex equivalents of the Tailwind colours used in COMPONENTS
const COMPONENT_HEX: Record<string, string> = {
  gwSuffering: "#8b5cf6", // violet-500
  benchPts:    "#f59e0b", // amber-500
  hitCost:     "#ef4444", // red-500
  captainPain: "#fb7185", // rose-400
};

// ── Org component chart ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const total = (payload as { value: number }[]).reduce((s, p) => s + p.value, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-800 mb-2">{label}</p>
      {[...payload].reverse().map((entry: { name: string; value: number; fill: string }) => (
        entry.value > 0 && (
          <div key={entry.name} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: entry.fill }} />
              <span className="text-slate-500">{entry.name}</span>
            </span>
            <span className="font-semibold text-slate-700 tabular-nums">{entry.value}</span>
          </div>
        )
      ))}
      <div className="flex items-center justify-between gap-4 pt-1.5 mt-1 border-t border-slate-100">
        <span className="font-semibold text-slate-600">Total</span>
        <span className="font-black text-slate-900 tabular-nums">{total}</span>
      </div>
    </div>
  );
}

function AgonyComponentChart({ managers }: { managers: AgonyManager[] }) {
  const chartData = managers.map((m) => ({
    name: m.displayName.split(" ")[0],
    "GW Suffering": m.breakdown.gwSuffering,
    "Bench Waste":  m.breakdown.benchPts,
    "Transfer Hits": m.breakdown.hitCost,
    "Captain Blanks": m.breakdown.captainPain,
  }));

  // Org totals per component for the summary pills
  const orgTotals = COMPONENTS.map(({ key, label }) => ({
    label,
    hex: COMPONENT_HEX[key],
    total: managers.reduce((s, m) => s + (m.breakdown[key] as number), 0),
  })).sort((a, b) => b.total - a.total);

  const dominantComponent = orgTotals[0];

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Org Agony Breakdown</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Where the suffering comes from — stacked by component
          </p>
        </div>
        {/* Dominant source callout */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400">Biggest org pain:</span>
          <span
            className="font-semibold px-2 py-0.5 rounded-full text-white text-[11px]"
            style={{ background: dominantComponent.hex }}
          >
            {dominantComponent.label} ({dominantComponent.total} pts)
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pt-3 pb-2">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 16, left: -8, bottom: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
            {COMPONENTS.map(({ key, label }, i) => (
              <Bar
                key={key}
                dataKey={label}
                stackId="agony"
                fill={COMPONENT_HEX[key]}
                radius={i === COMPONENTS.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              >
                {chartData.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={COMPONENT_HEX[key]}
                    opacity={idx === 0 ? 1 : 0.85}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Component legend with org totals */}
      <div className="px-4 pb-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {orgTotals.map(({ label, hex, total }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: hex }} />
            <span className="text-slate-500">{label}</span>
            <span className="font-semibold text-slate-700 tabular-nums">{total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Per-manager stacked bar ───────────────────────────────────────────────────

function BreakdownBar({
  breakdown,
  maxTotal,
}: {
  breakdown: AgonyBreakdown;
  maxTotal: number;
}) {
  const total = breakdown.totalAgony;
  const barWidth = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  return (
    <div>
      {/* Stacked proportion bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex" style={{ width: `${barWidth}%`, minWidth: "4px" }}>
        {COMPONENTS.map(({ key, colour }) => {
          const val = breakdown[key] as number;
          const pct = total > 0 ? (val / total) * 100 : 0;
          return pct > 0 ? (
            <div key={key} className={`${colour} h-full`} style={{ width: `${pct}%` }} title={`${key}: ${val}`} />
          ) : null;
        })}
      </div>
    </div>
  );
}

// ── Manager row ───────────────────────────────────────────────────────────────

function AgonyRow({
  manager,
  isFirst,
  isLast,
  maxTotal,
}: {
  manager: AgonyManager;
  isFirst: boolean;
  isLast: boolean;
  maxTotal: number;
}) {
  const { breakdown: b } = manager;

  const rankEmoji = isFirst ? "😭" : isLast ? "😎" : manager.rank <= 3 ? "😬" : "😐";

  return (
    <div className={`px-4 py-4 ${isFirst ? "bg-red-50/40" : isLast ? "bg-emerald-50/30" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Rank */}
        <div className="shrink-0 w-8 text-center">
          <span className="text-xl leading-none">{rankEmoji}</span>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5 tabular-nums">#{manager.rank}</p>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{manager.displayName}</p>
              <p className="text-xs text-slate-400 truncate">{manager.teamName}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-xl font-black tabular-nums leading-none ${
                isFirst ? "text-red-600" : isLast ? "text-emerald-600" : "text-slate-800"
              }`}>
                {b.totalAgony.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">agony pts</p>
            </div>
          </div>

          {/* Breakdown bar */}
          <div className="mt-2.5">
            <BreakdownBar breakdown={b} maxTotal={maxTotal} />
          </div>

          {/* Component pills */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COMPONENTS.map(({ key, label, colour, title }) => {
              const val = b[key] as number;
              if (val === 0) return null;
              return (
                <span
                  key={key}
                  title={title}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 cursor-default"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colour}`} />
                  {label}: {val}
                </span>
              );
            })}
          </div>

          {/* Flavour text */}
          <p className={`text-xs mt-2 italic ${isFirst ? "text-red-500" : isLast ? "text-emerald-600" : "text-slate-400"}`}>
            {flavourText(manager, isFirst, isLast)}
          </p>
        </div>
      </div>

      {/* Worst GW callout */}
      {manager.worstGw && manager.worstGw.orgWinner - manager.worstGw.pts >= 20 && (
        <div className="mt-3 ml-11 flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
          <span>📅</span>
          <span>
            Worst GW: <strong className="text-slate-600">GW{manager.worstGw.gw}</strong> —{" "}
            scored {manager.worstGw.pts} pts while the GW winner got {manager.worstGw.orgWinner} pts
            {" "}(gap: <span className="font-semibold text-red-500">−{manager.worstGw.orgWinner - manager.worstGw.pts}</span>)
          </span>
        </div>
      )}
    </div>
  );
}

const breakdown = (m: AgonyManager) => m.breakdown;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgonyPage() {
  const { data, isLoading, isError } = useQuery<AgonyResponse>({
    queryKey: ["agony"],
    queryFn: async () => {
      const r = await fetch("/api/agony");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  const managers = data?.managers ?? [];
  const maxTotal = managers[0]?.breakdown.totalAgony ?? 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">The Agony Index</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          A composite misfortune score. The leaderboard nobody wants to top.
        </p>
      </div>

      {/* Formula explainer */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Agony =</span>
        {COMPONENTS.map(({ key, label, colour }, i) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${colour}`} />
            <span>{label}</span>
            {i < COMPONENTS.length - 1 && <span className="text-slate-300 ml-1">+</span>}
          </span>
        ))}
      </div>

      {isLoading && (
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-card overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="px-4 py-4 border-b border-slate-50 last:border-0">
              <div className="flex gap-3">
                <div className="w-8 h-10 bg-slate-100 rounded animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-100 rounded animate-pulse w-1/3" />
                  <div className="h-2 bg-slate-100 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                </div>
                <div className="w-12 h-8 bg-slate-100 rounded animate-pulse shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load agony data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {managers.length > 0 && (
        <>
          {/* Org-wide component chart */}
          <AgonyComponentChart managers={managers} />

          {/* Leaderboard */}
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>Manager</span>
              <span>Agony Score</span>
            </div>

            <div className="divide-y divide-slate-50">
              {managers.map((m, i) => (
                <AgonyRow
                  key={m.managerId}
                  manager={m}
                  isFirst={i === 0}
                  isLast={i === managers.length - 1}
                  maxTotal={maxTotal}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 px-1">
            {COMPONENTS.map(({ colour, label, title }) => (
              <span key={label} className="flex items-center gap-1.5 cursor-default" title={title}>
                <span className={`w-2.5 h-2.5 rounded-sm ${colour}`} />
                {label}
              </span>
            ))}
            <span className="ml-auto text-slate-300 italic">Hover pills for details</span>
          </div>
        </>
      )}
    </div>
  );
}
