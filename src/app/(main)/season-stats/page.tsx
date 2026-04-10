"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface ManagerTitle {
  managerId: number;
  title: string;
  description: string;
  colour: string;
  border: string;
}

// Colour palette — shared with other chart pages
const COLOURS = [
  "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb",
  "#db2777", "#0891b2", "#65a30d", "#9333ea", "#ea580c",
  "#0d9488", "#be123c",
];

// Chip display config
const CHIP_META: Record<string, { label: string; short: string; colour: string; usedColour: string }> = {
  wildcard: { label: "Wildcard",      short: "WC", colour: "bg-teal-100 text-teal-700 border-teal-200",     usedColour: "bg-slate-100 text-slate-400 border-slate-200 line-through" },
  bboost:   { label: "Bench Boost",   short: "BB", colour: "bg-blue-100 text-blue-700 border-blue-200",     usedColour: "bg-slate-100 text-slate-400 border-slate-200 line-through" },
  "3xc":    { label: "Triple Captain",short: "TC", colour: "bg-purple-100 text-purple-700 border-purple-200", usedColour: "bg-slate-100 text-slate-400 border-slate-200 line-through" },
  freehit:  { label: "Free Hit",      short: "FH", colour: "bg-orange-100 text-orange-700 border-orange-200", usedColour: "bg-slate-100 text-slate-400 border-slate-200 line-through" },
};

// Card accent colours per manager index
const CARD_ACCENTS = [
  "border-t-violet-500",
  "border-t-emerald-500",
  "border-t-blue-500",
  "border-t-amber-500",
  "border-t-rose-500",
  "border-t-cyan-500",
  "border-t-fuchsia-500",
  "border-t-lime-500",
];

interface ChipSlot {
  name: string;
  windowStart: number;
  windowEnd: number;
  usedInGw: number | null;
}

interface ManagerStats {
  managerId: number;
  displayName: string;
  teamName: string;
  gwsPlayed: number;
  totalPoints: number;
  avgScore: number;
  highest: { gw: number; pts: number };
  lowest: { gw: number; pts: number };
  totalBenchPts: number;
  totalTransferCost: number;
  chipSlots: ChipSlot[];
  gwScores: number[];
}

interface SeasonStatsResponse {
  managers: ManagerStats[];
  currentGw: number;
}

// Compute org-wide bests/worsts for badge highlighting
function orgExtremes(managers: ManagerStats[]) {
  if (managers.length === 0) return {} as Record<string, number>;
  return {
    highestScore:    Math.max(...managers.map((m) => m.highest.pts)),
    lowestScore:     Math.min(...managers.map((m) => m.lowest.pts)),
    mostBench:       Math.max(...managers.map((m) => m.totalBenchPts)),
    leastBench:      Math.min(...managers.map((m) => m.totalBenchPts)),
    mostHits:        Math.max(...managers.map((m) => m.totalTransferCost)),
    bestAvg:         Math.max(...managers.map((m) => m.avgScore)),
    worstAvg:        Math.min(...managers.map((m) => m.avgScore)),
  };
}

// ── Score distribution box plot ────────────────────────────────────────────────

interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  avg: number;
}

function quartile(sorted: number[], p: number): number {
  const pos = p * (sorted.length - 1);
  const lo  = Math.floor(pos);
  const hi  = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function boxStats(scores: number[]): BoxStats {
  const s = [...scores].sort((a, b) => a - b);
  return {
    min:    s[0],
    q1:     quartile(s, 0.25),
    median: quartile(s, 0.5),
    q3:     quartile(s, 0.75),
    max:    s[s.length - 1],
    avg:    scores.reduce((t, v) => t + v, 0) / scores.length,
  };
}

function ScoreDistributionChart({ managers }: { managers: ManagerStats[] }) {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number;
    name: string; stats: BoxStats; colour: string;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  const PAD_L = 100;
  const PAD_R = 24;
  const PAD_T = 20;
  const PAD_B = 32;
  const ROW_H = 52;
  const VB_W  = 640;
  const VB_H  = PAD_T + managers.length * ROW_H + PAD_B;
  const innerW = VB_W - PAD_L - PAD_R;

  const allScores = managers.flatMap((m) => m.gwScores ?? []);
  if (allScores.length === 0) return null;

  const xMin = Math.max(0, Math.min(...allScores) - 5);
  const xMax = Math.max(...allScores) + 8;

  function toX(v: number) {
    return PAD_L + ((v - xMin) / (xMax - xMin)) * innerW;
  }

  // Grid ticks every 20 pts
  const tickStep = 20;
  const firstTick = Math.ceil(xMin / tickStep) * tickStep;
  const ticks: number[] = [];
  for (let t = firstTick; t <= xMax; t += tickStep) ticks.push(t);

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header — clickable to toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap text-left hover:bg-slate-50/60 transition-colors"
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800">GW Score Distribution</h2>
            {/* Chevron */}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Box = middle 50% of scores · line = median · circle = average · whiskers = full range
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0 flex-wrap">
          <span className="flex items-center gap-1.5">
            <svg width="28" height="12" viewBox="0 0 28 12">
              <rect x="7" y="2" width="14" height="8" fill="#7c3aed" fillOpacity={0.2} stroke="#7c3aed" strokeWidth={1.5} rx={1} />
              <line x1="14" y1="2" x2="14" y2="10" stroke="#7c3aed" strokeWidth={2.5} />
              <line x1="0" y1="6" x2="7" y2="6" stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.6} />
              <line x1="21" y1="6" x2="28" y2="6" stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.6} />
            </svg>
            Box &amp; whiskers
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="4" fill="white" stroke="#7c3aed" strokeWidth={2} />
            </svg>
            Average
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="3" fill="#7c3aed" fillOpacity={0.35} />
            </svg>
            Each GW
          </span>
        </div>
      </button>

      {/* SVG chart — collapsible */}
      {open && <div className="px-3 py-3 overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: "100%", minWidth: 340, height: "auto" }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Vertical grid lines */}
          {ticks.map((t) => (
            <line
              key={t}
              x1={toX(t)} y1={PAD_T - 6}
              x2={toX(t)} y2={VB_H - PAD_B}
              stroke="#f1f5f9" strokeWidth={1}
            />
          ))}

          {/* X-axis ticks + labels */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={toX(t)} y1={VB_H - PAD_B} x2={toX(t)} y2={VB_H - PAD_B + 4} stroke="#cbd5e1" strokeWidth={1} />
              <text x={toX(t)} y={VB_H - PAD_B + 14} textAnchor="middle" fontSize={10} fill="#94a3b8">{t}</text>
            </g>
          ))}

          {/* X-axis baseline */}
          <line x1={PAD_L} y1={VB_H - PAD_B} x2={VB_W - PAD_R} y2={VB_H - PAD_B} stroke="#e2e8f0" strokeWidth={1} />

          {/* Per-manager rows */}
          {managers.map((m, i) => {
            if (!m.gwScores?.length) return null;
            const stats = boxStats(m.gwScores);
            const colour = COLOURS[i % COLOURS.length];
            const cy = PAD_T + i * ROW_H + ROW_H / 2;
            const BOX_H = 18;

            return (
              <g
                key={m.managerId}
                onMouseEnter={(e) => {
                  const svgEl = svgRef.current;
                  if (!svgEl) return;
                  const rect = svgEl.getBoundingClientRect();
                  setTooltip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    name: m.displayName,
                    stats,
                    colour,
                  });
                }}
                onMouseMove={(e) => {
                  const svgEl = svgRef.current;
                  if (!svgEl) return;
                  const rect = svgEl.getBoundingClientRect();
                  setTooltip((prev) => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
                }}
                style={{ cursor: "default" }}
              >
                {/* Subtle row stripe */}
                {i % 2 === 0 && (
                  <rect x={PAD_L} y={cy - ROW_H / 2} width={innerW} height={ROW_H} fill="#f8fafc" />
                )}

                {/* Manager name */}
                <text x={PAD_L - 8} y={cy + 4} textAnchor="end" fontSize={11} fill="#475569" fontWeight={500}>
                  {m.displayName}
                </text>

                {/* Individual GW dots — jittered vertically by index */}
                {m.gwScores.map((score, j) => {
                  const jitter = ((j * 13 + 7) % 15) - 7; // deterministic spread in [-7, 7]
                  return (
                    <circle
                      key={j}
                      cx={toX(score)}
                      cy={cy + jitter}
                      r={2.5}
                      fill={colour}
                      opacity={0.28}
                    />
                  );
                })}

                {/* Whisker: min → Q1 */}
                <line x1={toX(stats.min)} y1={cy} x2={toX(stats.q1)} y2={cy}
                  stroke={colour} strokeWidth={1.5} opacity={0.65} />
                {/* Cap at min */}
                <line x1={toX(stats.min)} y1={cy - 6} x2={toX(stats.min)} y2={cy + 6}
                  stroke={colour} strokeWidth={1.5} opacity={0.65} />

                {/* Whisker: Q3 → max */}
                <line x1={toX(stats.q3)} y1={cy} x2={toX(stats.max)} y2={cy}
                  stroke={colour} strokeWidth={1.5} opacity={0.65} />
                {/* Cap at max */}
                <line x1={toX(stats.max)} y1={cy - 6} x2={toX(stats.max)} y2={cy + 6}
                  stroke={colour} strokeWidth={1.5} opacity={0.65} />

                {/* IQR box fill */}
                <rect
                  x={toX(stats.q1)} y={cy - BOX_H / 2}
                  width={Math.max(toX(stats.q3) - toX(stats.q1), 2)} height={BOX_H}
                  fill={colour} fillOpacity={0.18} rx={2}
                />
                {/* IQR box border */}
                <rect
                  x={toX(stats.q1)} y={cy - BOX_H / 2}
                  width={Math.max(toX(stats.q3) - toX(stats.q1), 2)} height={BOX_H}
                  fill="none" stroke={colour} strokeWidth={1.5} rx={2}
                />

                {/* Median line */}
                <line
                  x1={toX(stats.median)} y1={cy - BOX_H / 2}
                  x2={toX(stats.median)} y2={cy + BOX_H / 2}
                  stroke={colour} strokeWidth={2.5}
                />

                {/* Average dot */}
                <circle cx={toX(stats.avg)} cy={cy} r={4.5}
                  fill="white" stroke={colour} strokeWidth={2} />
              </g>
            );
          })}
        </svg>

        {/* Tooltip — rendered as absolute div relative to the chart container */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-20 bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[170px]"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
          >
            <p className="font-semibold mb-1.5 truncate" style={{ color: tooltip.colour }}>
              {tooltip.name}
            </p>
            {(
              [
                ["Min",    tooltip.stats.min],
                ["Q1",     tooltip.stats.q1],
                ["Median", tooltip.stats.median],
                ["Avg",    tooltip.stats.avg],
                ["Q3",     tooltip.stats.q3],
                ["Max",    tooltip.stats.max],
              ] as [string, number][]
            ).map(([label, val]) => (
              <div key={label} className="flex justify-between gap-3 py-0.5">
                <span className="text-slate-400">{label}</span>
                <span className="font-bold tabular-nums text-slate-700">{Math.round(val * 10) / 10}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-slate-100">
              <span className="text-slate-400">Spread (IQR)</span>
              <span className="font-bold tabular-nums text-slate-700">
                {Math.round((tooltip.stats.q3 - tooltip.stats.q1) * 10) / 10}
              </span>
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0 gap-2">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <div className="text-right">
        <span
          className={`text-sm font-bold tabular-nums ${
            highlight ? "text-emerald-600" : warn ? "text-red-500" : "text-slate-800"
          }`}
        >
          {value}
        </span>
        {sub && <span className="text-xs text-slate-400 ml-1.5">{sub}</span>}
        {highlight && (
          <span className="ml-1.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded-full uppercase tracking-wide">
            Best
          </span>
        )}
        {warn && (
          <span className="ml-1.5 text-[9px] font-bold text-red-500 bg-red-50 border border-red-200 px-1 py-0.5 rounded-full uppercase tracking-wide">
            Worst
          </span>
        )}
      </div>
    </div>
  );
}

function ChipsSection({ slots }: { slots: ChipSlot[] }) {
  const availableCount = slots.filter((s) => s.usedInGw === null).length;

  return (
    <div className="pt-2.5 mt-0.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Chips</span>
        <span className="text-xs text-slate-400">
          <span className={`font-bold ${availableCount > 0 ? "text-emerald-600" : "text-slate-400"}`}>
            {availableCount}
          </span>
          /{slots.length} remaining
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((slot, idx) => {
          const meta = CHIP_META[slot.name] ?? {
            short: slot.name.toUpperCase().slice(0, 2),
            colour: "bg-slate-100 text-slate-600 border-slate-200",
            usedColour: "bg-slate-100 text-slate-400 border-slate-200 line-through",
            label: slot.name,
          };
          const isUsed = slot.usedInGw !== null;
          const isWildcard = slot.name === "wildcard";

          return (
            <div key={idx} className="relative group">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border cursor-default select-none ${
                  isUsed ? meta.usedColour : meta.colour
                }`}
                title={
                  isUsed
                    ? `${meta.label} used in GW${slot.usedInGw}`
                    : isWildcard
                    ? `${meta.label} available (GW${slot.windowStart}–GW${slot.windowEnd})`
                    : `${meta.label} available`
                }
              >
                {meta.short}
                {isWildcard && slots.filter((s) => s.name === "wildcard").length > 1 && (
                  <span className="opacity-60">
                    {slot.windowStart <= 19 ? "1" : "2"}
                  </span>
                )}
                {isUsed && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                )}
              </span>
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 hidden group-hover:block bg-slate-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap pointer-events-none">
                {isUsed ? `Used GW${slot.usedInGw}` : isWildcard ? `GW${slot.windowStart}–${slot.windowEnd}` : "Available"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManagerCard({
  manager,
  index,
  extremes,
  title,
}: {
  manager: ManagerStats;
  index: number;
  extremes: ReturnType<typeof orgExtremes>;
  title?: ManagerTitle;
}) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const chipsLeft = manager.chipSlots.filter((s) => s.usedInGw === null).length;

  return (
    <div className={`bg-white border border-slate-200/80 border-t-4 ${accent} rounded-xl shadow-card overflow-hidden`}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{manager.displayName}</p>
            <p className="text-xs text-slate-400 truncate mt-0.5">{manager.teamName}</p>
            {title && (
              <div
                className={`inline-flex items-center mt-2 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${title.colour} ${title.border}`}
                title={title.description}
              >
                {title.title}
              </div>
            )}
            {title && (
              <p className="text-[10px] text-slate-400 mt-1 italic">{title.description}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-black text-slate-800 tabular-nums leading-none">{manager.totalPoints}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">total pts</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
            {manager.gwsPlayed} GWs played
          </span>
          {chipsLeft > 0 && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              {chipsLeft} chip{chipsLeft !== 1 ? "s" : ""} left
            </span>
          )}
          {chipsLeft === 0 && (
            <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
              No chips left
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-1">
        <StatRow
          label="Average GW score"
          value={`${manager.avgScore} pts`}
          highlight={manager.avgScore === extremes.bestAvg}
          warn={manager.avgScore === extremes.worstAvg && extremes.bestAvg !== extremes.worstAvg}
        />
        <StatRow
          label="Highest GW score"
          value={`${manager.highest.pts} pts`}
          sub={`GW${manager.highest.gw}`}
          highlight={manager.highest.pts === extremes.highestScore}
        />
        <StatRow
          label="Lowest GW score"
          value={`${manager.lowest.pts} pts`}
          sub={`GW${manager.lowest.gw}`}
          warn={manager.lowest.pts === extremes.lowestScore && extremes.lowestScore !== extremes.highestScore}
        />
        <StatRow
          label="Bench pts wasted"
          value={`${manager.totalBenchPts} pts`}
          warn={manager.totalBenchPts === extremes.mostBench && extremes.mostBench !== extremes.leastBench}
          highlight={manager.totalBenchPts === extremes.leastBench && extremes.mostBench !== extremes.leastBench}
        />
        <StatRow
          label="Transfer cost"
          value={manager.totalTransferCost > 0 ? `-${manager.totalTransferCost} pts` : "None"}
          warn={manager.totalTransferCost === extremes.mostHits && extremes.mostHits > 0}
          highlight={manager.totalTransferCost === 0 && extremes.mostHits > 0}
        />
      </div>

      {/* Chips */}
      <div className="px-4 pb-4">
        <ChipsSection slots={manager.chipSlots} />
      </div>
    </div>
  );
}

export default function SeasonStatsPage() {
  const { data, isLoading, isError } = useQuery<SeasonStatsResponse>({
    queryKey: ["season-stats"],
    queryFn: async () => {
      const r = await fetch("/api/season-stats");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  const { data: titlesData } = useQuery<{ titles: ManagerTitle[] }>({
    queryKey: ["titles"],
    queryFn: () => fetch("/api/titles").then((r) => r.json()),
    staleTime: 300_000,
  });

  const titlesMap = titlesData
    ? new Map(titlesData.titles.map((t) => [t.managerId, t]))
    : undefined;

  const extremes = data ? orgExtremes(data.managers) : ({} as ReturnType<typeof orgExtremes>);

  // Org summary totals
  const orgTotalHits = data?.managers.reduce((s, m) => s + m.totalTransferCost, 0) ?? 0;
  const orgTotalBench = data?.managers.reduce((s, m) => s + m.totalBenchPts, 0) ?? 0;
  const orgChipsLeft = data?.managers.reduce((m, mg) => m + mg.chipSlots.filter((s) => s.usedInGw === null).length, 0) ?? 0;
  const orgHighest = data ? Math.max(...data.managers.map((m) => m.highest.pts)) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Season Stats</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {data ? `GW1–GW${data.currentGw} · per-manager season summary` : "Per-manager season summary"}
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-white border border-slate-200/80 border-t-4 border-t-slate-200 rounded-xl animate-pulse shadow-card" />
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load season stats. The FPL API may be temporarily unavailable.
        </div>
      )}

      {data && data.managers.length > 0 && (
        <>
          {/* Org summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <OrgTile label="Org highest score" value={`${orgHighest} pts`} />
            <OrgTile label="Org bench wasted" value={`${orgTotalBench} pts`} warn />
            <OrgTile label="Org transfer hits" value={orgTotalHits > 0 ? `-${orgTotalHits} pts` : "None"} warn={orgTotalHits > 0} />
            <OrgTile label="Chips remaining" value={`${orgChipsLeft} total`} highlight={orgChipsLeft > 0} />
          </div>

          {/* Score distribution */}
          <div className="relative">
            <ScoreDistributionChart managers={data.managers} />
          </div>

          {/* Manager cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.managers.map((m, idx) => (
              <ManagerCard key={m.managerId} manager={m} index={idx} extremes={extremes} title={titlesMap?.get(m.managerId)} />
            ))}
          </div>

          <p className="text-xs text-slate-400 text-center">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Best in org
            </span>
            <span className="mx-3">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Worst in org
            </span>
            <span className="mx-3">·</span>
            Chip tooltips on hover
          </p>
        </>
      )}
    </div>
  );
}

function OrgTile({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  const bg = highlight
    ? "bg-emerald-50 border-emerald-200"
    : warn
    ? "bg-amber-50 border-amber-200"
    : "bg-white border-slate-200/80";
  const colour = highlight ? "text-emerald-700" : warn ? "text-amber-700" : "text-slate-800";
  return (
    <div className={`rounded-xl px-4 py-3 border ${bg} shadow-card`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-base font-black tabular-nums ${colour}`}>{value}</p>
    </div>
  );
}
