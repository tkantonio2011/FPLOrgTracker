"use client";

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
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LuckBreakdown {
  captainLuck: number;
  benchLuck: number;
  autoSubLuck: number;
  totalLuck: number;
  captainTotal: number;
  orgAvgCaptainTotal: number;
  benchTotal: number;
  orgAvgBenchTotal: number;
  autoSubPts: number;
  orgAvgAutoSubPts: number;
  captainBlanks: number;
  captainHauls: number;
}

interface LuckManager {
  managerId: number;
  displayName: string;
  teamName: string;
  breakdown: LuckBreakdown;
  rank: number;
}

interface LuckResponse {
  managers: LuckManager[];
  currentGw: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sign(n: number) {
  return n > 0 ? `+${n}` : `${n}`;
}

function luckLabel(total: number, max: number, min: number): string {
  const range = max - min || 1;
  const pct   = (total - min) / range;
  if (pct >= 0.85) return "Blessed";
  if (pct >= 0.65) return "Quite lucky";
  if (pct >= 0.45) return "About average";
  if (pct >= 0.25) return "A bit unlucky";
  return "Cursed";
}

function luckColour(total: number, max: number, min: number) {
  const range = max - min || 1;
  const pct   = (total - min) / range;
  if (pct >= 0.65) return { bar: "bg-emerald-500", text: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (pct >= 0.35) return { bar: "bg-slate-400",   text: "text-slate-500",   badge: "bg-slate-100 text-slate-600 border-slate-200"     };
  return              { bar: "bg-red-500",    text: "text-red-600",    badge: "bg-red-100 text-red-600 border-red-200"         };
}

// ── Stacked component chart ───────────────────────────────────────────────────

const LUCK_COLOURS = {
  captainLuck:  "#8b5cf6", // violet-500
  benchLuck:    "#3b82f6", // blue-500
  autoSubLuck:  "#14b8a6", // teal-500
} as const;

const LUCK_LABELS = {
  captainLuck:  "Captain luck",
  benchLuck:    "Bench luck",
  autoSubLuck:  "Auto-sub luck",
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LuckTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const total: number = row.totalLuck ?? 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[190px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {(["captainLuck", "benchLuck", "autoSubLuck"] as const).map((key) => {
        const v: number = row[key] ?? 0;
        return (
          <div key={key} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: LUCK_COLOURS[key] }} />
              {LUCK_LABELS[key]}
            </span>
            <span className={`font-bold tabular-nums ${v > 0 ? "text-emerald-600" : v < 0 ? "text-red-500" : "text-slate-400"}`}>
              {v > 0 ? `+${v}` : v}
            </span>
          </div>
        );
      })}
      <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-slate-100">
        <span className="font-semibold text-slate-600">Total</span>
        <span className={`font-black tabular-nums ${total > 0 ? "text-emerald-600" : total < 0 ? "text-red-500" : "text-slate-400"}`}>
          {total > 0 ? `+${total}` : total}
        </span>
      </div>
    </div>
  );
}

function LuckStackedChart({ managers }: { managers: LuckManager[] }) {
  // Sort luckiest → least lucky (top to bottom in horizontal chart)
  const sorted = [...managers].sort((a, b) => b.breakdown.totalLuck - a.breakdown.totalLuck);

  const chartData = sorted.map((m) => ({
    name: m.displayName,
    captainLuck:  m.breakdown.captainLuck,
    benchLuck:    m.breakdown.benchLuck,
    autoSubLuck:  m.breakdown.autoSubLuck,
    totalLuck:    m.breakdown.totalLuck,
  }));

  // Compute axis domain with padding
  const allTotals = sorted.map((m) => m.breakdown.totalLuck);
  const absMax = Math.max(...allTotals.map(Math.abs), 1);
  const domainBound = Math.ceil(absMax * 1.2);

  const rowHeight = 36;
  const chartHeight = sorted.length * rowHeight + 40;

  // Org totals per component for the legend
  const orgTotals = (["captainLuck", "benchLuck", "autoSubLuck"] as const).map((key) => ({
    key,
    label: LUCK_LABELS[key],
    colour: LUCK_COLOURS[key],
    total: sorted.reduce((s, m) => s + m.breakdown[key], 0),
  }));

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Luck Composition by Manager</h2>
          <p className="text-xs text-slate-400 mt-0.5">Sorted luckiest → least lucky · bars extend right (+) or left (−) of zero</p>
        </div>
        {/* Legend with org totals */}
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          {orgTotals.map(({ key, label, colour, total }) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colour }} />
              {label}
              <span className={`font-semibold tabular-nums ${total > 0 ? "text-emerald-600" : total < 0 ? "text-red-500" : "text-slate-400"}`}>
                ({total > 0 ? `+${total}` : total})
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
            barCategoryGap="25%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis
              type="number"
              domain={[-domainBound, domainBound]}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v > 0 ? `+${v}` : `${v}`)}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fontSize: 11, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<LuckTooltip />} cursor={{ fill: "#f8fafc" }} />
            <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1.5} />
            <Bar dataKey="captainLuck" stackId="luck" fill={LUCK_COLOURS.captainLuck} radius={[0, 0, 0, 0]} />
            <Bar dataKey="benchLuck"   stackId="luck" fill={LUCK_COLOURS.benchLuck}   radius={[0, 0, 0, 0]} />
            <Bar dataKey="autoSubLuck" stackId="luck" fill={LUCK_COLOURS.autoSubLuck} radius={[2, 2, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Hero banners ──────────────────────────────────────────────────────────────

function HeroBanners({ luckiest, unluckiest }: { luckiest: LuckManager; unluckiest: LuckManager }) {
  const { breakdown: lb } = luckiest;
  const { breakdown: ub } = unluckiest;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Luckiest */}
      <div className="bg-emerald-600 rounded-xl px-5 py-4 text-white shadow-card">
        <p className="text-emerald-200 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span>🍀</span> Luckiest Manager
        </p>
        <p className="text-xl font-black">{luckiest.displayName}</p>
        <p className="text-emerald-200 text-xs mt-0.5 truncate">{luckiest.teamName}</p>
        <p className="text-3xl font-black tabular-nums mt-3 leading-none">
          +{lb.totalLuck}
        </p>
        <p className="text-emerald-200 text-xs mt-0.5">luck pts above average</p>
        <div className="mt-3 space-y-1 text-xs text-emerald-100">
          {lb.captainLuck > 0 && (
            <p>⚽ Captains over-delivered by <strong>{sign(lb.captainLuck)} pts</strong> vs org avg</p>
          )}
          {lb.captainHauls > 0 && (
            <p>🎯 {lb.captainHauls} captain haul{lb.captainHauls !== 1 ? "s" : ""} (≥15 pts)</p>
          )}
          {lb.benchLuck > 0 && (
            <p>🪑 Bench was <strong>{sign(lb.benchLuck)} pts</strong> better than org avg</p>
          )}
          {lb.autoSubLuck > 0 && (
            <p>🔄 Auto-subs contributed <strong>+{lb.autoSubPts} pts</strong></p>
          )}
        </div>
      </div>

      {/* Most hard done by */}
      <div className="bg-red-700 rounded-xl px-5 py-4 text-white shadow-card">
        <p className="text-red-200 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span>😤</span> Most Hard Done By
        </p>
        <p className="text-xl font-black">{unluckiest.displayName}</p>
        <p className="text-red-200 text-xs mt-0.5 truncate">{unluckiest.teamName}</p>
        <p className="text-3xl font-black tabular-nums mt-3 leading-none">
          {ub.totalLuck}
        </p>
        <p className="text-red-200 text-xs mt-0.5">luck pts below average</p>
        <div className="mt-3 space-y-1 text-xs text-red-100">
          {ub.captainLuck < 0 && (
            <p>⚽ Captains under-delivered by <strong>{sign(ub.captainLuck)} pts</strong> vs org avg</p>
          )}
          {ub.captainBlanks > 0 && (
            <p>💀 {ub.captainBlanks} captain blank{ub.captainBlanks !== 1 ? "s" : ""} (≤2 pts)</p>
          )}
          {ub.benchLuck < 0 && (
            <p>🪑 Bench over-scored by <strong>{Math.abs(ub.benchLuck)} pts</strong> vs org avg</p>
          )}
          {ub.autoSubLuck < 0 && (
            <p>🔄 Auto-subs underperformed by <strong>{ub.autoSubLuck} pts</strong></p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manager card ──────────────────────────────────────────────────────────────

function ManagerCard({
  manager,
  max,
  min,
}: {
  manager: LuckManager;
  max: number;
  min: number;
}) {
  const { breakdown: b } = manager;
  const colours = luckColour(b.totalLuck, max, min);
  const label   = luckLabel(b.totalLuck, max, min);

  // Bar position: map totalLuck to 0–100% of bar width
  const range   = max - min || 1;
  const barPct  = Math.max(4, Math.round(((b.totalLuck - min) / range) * 100));

  const components = [
    {
      label: "Captain luck",
      value: b.captainLuck,
      detail: `You: ${b.captainTotal} pts · Org avg: ${b.orgAvgCaptainTotal} pts`,
      sub: b.captainBlanks > 0 ? `${b.captainBlanks} blank${b.captainBlanks !== 1 ? "s" : ""}` : b.captainHauls > 0 ? `${b.captainHauls} haul${b.captainHauls !== 1 ? "s" : ""}` : null,
    },
    {
      label: "Bench luck",
      value: b.benchLuck,
      detail: `Your bench: ${b.benchTotal} pts · Org avg: ${b.orgAvgBenchTotal} pts`,
      sub: null,
    },
    {
      label: "Auto-sub luck",
      value: b.autoSubLuck,
      detail: `Your auto-subs: ${b.autoSubPts} pts · Org avg: ${b.orgAvgAutoSubPts} pts`,
      sub: null,
    },
  ];

  return (
    <div className="px-4 py-4">
      {/* Row header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
              manager.rank === 1
                ? "bg-emerald-500 text-white"
                : manager.rank === (max - min > 0 ? undefined : 0)
                ? "bg-red-500 text-white"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {manager.rank}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{manager.displayName}</p>
            <p className="text-xs text-slate-400 truncate">{manager.teamName}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-black tabular-nums leading-none ${colours.text}`}>
            {sign(b.totalLuck)}
          </p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border mt-1 inline-block ${colours.badge}`}>
            {label}
          </span>
        </div>
      </div>

      {/* Luck bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full ${colours.bar} transition-all`}
          style={{ width: `${barPct}%` }}
        />
      </div>

      {/* Component breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {components.map(({ label: lbl, value, detail, sub }) => (
          <div
            key={lbl}
            className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100"
            title={detail}
          >
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{lbl}</p>
            <p className={`text-sm font-black tabular-nums mt-0.5 ${value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-slate-400"}`}>
              {sign(value)} pts
            </p>
            {sub && (
              <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LuckPage() {
  const { data, isLoading, isError } = useQuery<LuckResponse>({
    queryKey: ["luck"],
    queryFn: async () => {
      const r = await fetch("/api/luck");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  const managers = data?.managers ?? [];
  const max = managers[0]?.breakdown.totalLuck ?? 0;
  const min = managers[managers.length - 1]?.breakdown.totalLuck ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Lucky / Unlucky Ranking</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Who's been helped by the FPL gods — and who's been forsaken.
        </p>
      </div>

      {/* Method explainer */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 space-y-1">
        <p><span className="font-semibold text-slate-600">Captain luck</span> — actual captain pts vs org-average captain pts each GW (above avg = lucky)</p>
        <p><span className="font-semibold text-slate-600">Bench luck</span> — org-average bench pts vs your bench pts each GW (below avg = lucky: your bench players didn't outscore your XI)</p>
        <p><span className="font-semibold text-slate-600">Auto-sub luck</span> — pts scored by your auto-subbed players vs org average (more pts = lucky: your starters blanked but the subs delivered)</p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-40 bg-emerald-100 rounded-xl animate-pulse" />
            <div className="h-40 bg-red-100 rounded-xl animate-pulse" />
          </div>
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="px-4 py-4 border-b border-slate-50 last:border-0 space-y-2">
                <div className="h-4 bg-slate-100 rounded animate-pulse w-1/3" />
                <div className="h-1.5 bg-slate-100 rounded animate-pulse" />
                <div className="grid grid-cols-3 gap-2">
                  {[1,2,3].map(j => <div key={j} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load luck data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {managers.length > 0 && (
        <>
          <HeroBanners
            luckiest={managers[0]}
            unluckiest={managers[managers.length - 1]}
          />

          <LuckStackedChart managers={managers} />

          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>Manager</span>
              <span>Luck Score</span>
            </div>
            <div className="divide-y divide-slate-50">
              {managers.map((m) => (
                <ManagerCard key={m.managerId} manager={m} max={max} min={min} />
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center px-2">
            Luck scores are relative to the org average — zero means exactly average luck.
            Hover component cards for raw numbers.
          </p>
        </>
      )}
    </div>
  );
}
