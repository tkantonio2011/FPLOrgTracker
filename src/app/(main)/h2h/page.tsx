"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgMember {
  managerId: number;
  displayName: string;
  teamName: string;
}

interface OrgData {
  name: string;
  members: OrgMember[];
}

interface H2HGw {
  gw: number;
  ptsA: number;
  ptsB: number;
  winner: "A" | "B" | "draw";
  margin: number;
}

interface H2HSummary {
  winsA: number;
  winsB: number;
  draws: number;
  netPtsA: number;
  avgMargin: number;
  longestStreakA: number;
  longestStreakB: number;
  currentStreakHolder: "A" | "B" | "draw" | null;
  currentStreak: number;
  biggestWinA: { gw: number; margin: number } | null;
  biggestWinB: { gw: number; margin: number } | null;
}

interface H2HResponse {
  managerA: { managerId: number; displayName: string; teamName: string; totalPoints: number };
  managerB: { managerId: number; displayName: string; teamName: string; totalPoints: number };
  gws: H2HGw[];
  summary: H2HSummary;
  currentGw: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstName(name: string) {
  return name.split(" ")[0];
}

function rivalrySummaryLine(
  a: H2HResponse["managerA"],
  b: H2HResponse["managerB"],
  s: H2HSummary
): string {
  const fnA = firstName(a.displayName);
  const fnB = firstName(b.displayName);
  const totalGws = s.winsA + s.winsB + s.draws;

  if (s.winsA === s.winsB) {
    return `${fnA} and ${fnB} are dead level — ${s.winsA}W–${s.winsB}L–${s.draws}D each · avg margin ${s.avgMargin} pts`;
  }
  const leader = s.winsA > s.winsB ? fnA : fnB;
  const trailer = s.winsA > s.winsB ? fnB : fnA;
  const leaderWins = Math.max(s.winsA, s.winsB);
  const trailerWins = Math.min(s.winsA, s.winsB);
  const winPct = Math.round((leaderWins / totalGws) * 100);

  const netAbs = Math.abs(s.netPtsA);
  const netSign = s.winsA > s.winsB ? "+" : "-";

  return `${leader} leads ${trailer} ${leaderWins}W–${trailerWins}L–${s.draws}D (${winPct}% win rate) · avg margin ${s.avgMargin} pts · net ${netSign}${netAbs} pts`;
}

// ── Trash talk weigh-in card ──────────────────────────────────────────────────

function TrashTalkCard({
  quoteA,
  quoteB,
  nameA,
  nameB,
  loading,
}: {
  quoteA: string | null;
  quoteB: string | null;
  nameA: string;
  nameB: string;
  loading: boolean;
}) {
  if (!loading && !quoteA && !quoteB) return null;

  return (
    <div
      className="rounded-xl overflow-hidden shadow-card border border-white/5"
      style={{ background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #0f0f0f 100%)" }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">
          🥊 Pre-Fight Weigh-In
        </span>
        {loading && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="text-white/30 animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        )}
      </div>

      {/* Two corners */}
      <div className="grid grid-cols-2 min-h-[100px]">
        {/* Corner A — emerald */}
        <div className="px-4 py-4 border-r border-white/10 flex flex-col gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/70">
            {nameA} corner
          </span>
          {loading && !quoteA ? (
            <div className="space-y-1.5 flex-1">
              <div className="h-3 bg-white/10 rounded animate-pulse w-full" />
              <div className="h-3 bg-white/10 rounded animate-pulse w-4/5" />
            </div>
          ) : quoteA ? (
            <blockquote className="text-sm text-white/90 leading-snug font-medium italic flex-1">
              <span className="text-emerald-400 font-black text-base leading-none mr-1 not-italic">&ldquo;</span>
              {quoteA}
              <span className="text-emerald-400 font-black text-base leading-none ml-1 not-italic">&rdquo;</span>
            </blockquote>
          ) : null}
        </div>

        {/* Corner B — rose */}
        <div className="px-4 py-4 flex flex-col gap-2 items-end text-right">
          <span className="text-[9px] font-black uppercase tracking-widest text-rose-400/70">
            {nameB} corner
          </span>
          {loading && !quoteB ? (
            <div className="space-y-1.5 flex-1 w-full">
              <div className="h-3 bg-white/10 rounded animate-pulse w-full" />
              <div className="h-3 bg-white/10 rounded animate-pulse w-4/5 ml-auto" />
            </div>
          ) : quoteB ? (
            <blockquote className="text-sm text-white/90 leading-snug font-medium italic flex-1">
              <span className="text-rose-400 font-black text-base leading-none mr-1 not-italic">&ldquo;</span>
              {quoteB}
              <span className="text-rose-400 font-black text-base leading-none ml-1 not-italic">&rdquo;</span>
            </blockquote>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-1.5 border-t border-white/5 text-center">
        <span className="text-[9px] text-white/15 font-medium">AI-generated banter · The FPL Gazette</span>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ManagerSelect({
  label,
  members,
  value,
  onChange,
  exclude,
}: {
  label: string;
  members: OrgMember[];
  value: number | null;
  onChange: (id: number) => void;
  exclude: number | null;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <select
        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 shadow-sm"
        value={value ?? ""}
        onChange={(e) => onChange(parseInt(e.target.value))}
      >
        <option value="" disabled>
          Select manager…
        </option>
        {members
          .filter((m) => m.managerId !== exclude)
          .map((m) => (
            <option key={m.managerId} value={m.managerId}>
              {m.displayName} · {m.teamName}
            </option>
          ))}
      </select>
    </div>
  );
}

function RivalryCard({
  data,
}: {
  data: H2HResponse;
}) {
  const { managerA: a, managerB: b, summary: s } = data;
  const fnA = firstName(a.displayName);
  const fnB = firstName(b.displayName);

  const leaderIsA = s.winsA > s.winsB;
  const leaderIsB = s.winsB > s.winsA;
  const isLevel = s.winsA === s.winsB;

  return (
    <div className="bg-[#37003c] rounded-xl overflow-hidden shadow-card text-white">
      {/* Headline record */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10">
        <p className="text-[#00ff87] text-xs font-semibold uppercase tracking-wider mb-3">
          Rivalry Record
        </p>

        <div className="flex items-center gap-3">
          {/* Manager A */}
          <div className="flex-1 min-w-0 text-center">
            <p className="text-lg font-black truncate">{fnA}</p>
            <p className="text-white/50 text-xs truncate mt-0.5">{a.teamName}</p>
            <p
              className={`text-3xl font-black tabular-nums mt-2 leading-none ${
                leaderIsA ? "text-[#00ff87]" : isLevel ? "text-white/70" : "text-white/40"
              }`}
            >
              {s.winsA}
            </p>
            <p className="text-white/40 text-[10px] uppercase tracking-wide mt-0.5">wins</p>
          </div>

          {/* VS divider */}
          <div className="shrink-0 text-center px-2">
            <div className="text-white/20 text-xl font-black">VS</div>
            <div className="mt-2 text-white/60 text-sm font-semibold tabular-nums">{s.draws}</div>
            <div className="text-white/30 text-[10px] uppercase tracking-wide">draws</div>
          </div>

          {/* Manager B */}
          <div className="flex-1 min-w-0 text-center">
            <p className="text-lg font-black truncate">{fnB}</p>
            <p className="text-white/50 text-xs truncate mt-0.5">{b.teamName}</p>
            <p
              className={`text-3xl font-black tabular-nums mt-2 leading-none ${
                leaderIsB ? "text-[#00ff87]" : isLevel ? "text-white/70" : "text-white/40"
              }`}
            >
              {s.winsB}
            </p>
            <p className="text-white/40 text-[10px] uppercase tracking-wide mt-0.5">wins</p>
          </div>
        </div>
      </div>

      {/* Summary line */}
      <div className="px-5 py-3 border-b border-white/10">
        <p className="text-white/70 text-xs leading-relaxed">
          {rivalrySummaryLine(a, b, s)}
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10">
        <StatPill
          label="Avg margin"
          value={`${s.avgMargin} pts`}
        />
        <StatPill
          label="Net pts"
          value={
            s.netPtsA === 0
              ? "Level"
              : `${s.netPtsA > 0 ? fnA : fnB} +${Math.abs(s.netPtsA)}`
          }
        />
        <StatPill
          label={`${fnA} best streak`}
          value={`${s.longestStreakA}W`}
        />
        <StatPill
          label={`${fnB} best streak`}
          value={`${s.longestStreakB}W`}
        />
      </div>

      {/* Current streak */}
      {s.currentStreakHolder && s.currentStreak >= 2 && (
        <div className="px-5 py-2.5 bg-white/5 text-xs text-white/60 text-center">
          {s.currentStreakHolder === "A" ? fnA : fnB} is on a{" "}
          <span className="text-[#00ff87] font-bold">{s.currentStreak}-GW winning streak</span>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5 text-center">
      <p className="text-white/40 text-[10px] uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-white text-sm font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}

// ── Custom tooltip for GW scores chart ───────────────────────────────────────
function ScoresTooltip({
  active, payload, label, fnA, fnB,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
  fnA: string;
  fnB: string;
}) {
  if (!active || !payload?.length) return null;
  const a = payload.find((p) => p.name === "a")?.value ?? 0;
  const b = payload.find((p) => p.name === "b")?.value ?? 0;
  const winner = a > b ? fnA : b > a ? fnB : "Draw";
  const margin = Math.abs(a - b);
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[130px]">
      <p className="font-bold text-slate-700 mb-1.5">GW{label}</p>
      <p className="flex justify-between gap-3">
        <span className="text-emerald-600 font-semibold">{fnA}</span>
        <span className="font-bold tabular-nums text-emerald-700">{a} pts</span>
      </p>
      <p className="flex justify-between gap-3">
        <span className="text-rose-600 font-semibold">{fnB}</span>
        <span className="font-bold tabular-nums text-rose-600">{b} pts</span>
      </p>
      {margin > 0 && (
        <p className="mt-1.5 pt-1.5 border-t border-slate-100 text-slate-500">
          {winner} wins by <span className="font-bold text-slate-700">{margin}</span>
        </p>
      )}
      {margin === 0 && (
        <p className="mt-1.5 pt-1.5 border-t border-slate-100 text-slate-500">Draw</p>
      )}
    </div>
  );
}

// ── Custom tooltip for running gap chart ──────────────────────────────────────
function GapTooltip({
  active, payload, label, fnA, fnB,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  fnA: string;
  fnB: string;
}) {
  if (!active || !payload?.length) return null;
  const gap = payload[0]?.value ?? 0;
  const ahead = gap > 0 ? fnA : gap < 0 ? fnB : null;
  const abs = Math.abs(gap);
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[130px]">
      <p className="font-bold text-slate-700 mb-1">GW{label}</p>
      {ahead ? (
        <p className={gap > 0 ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold"}>
          {ahead} leads by <span className="font-bold">{abs} pts</span>
        </p>
      ) : (
        <p className="text-slate-500">Level</p>
      )}
    </div>
  );
}

function H2HCharts({ data }: { data: H2HResponse }) {
  const [activeTab, setActiveTab] = useState<"scores" | "gap">("scores");
  const { managerA: a, managerB: b, gws } = data;
  const fnA = firstName(a.displayName);
  const fnB = firstName(b.displayName);

  // Build chart data
  let runA = 0, runB = 0;
  const chartData = gws.map((g) => {
    runA += g.ptsA;
    runB += g.ptsB;
    return {
      gw: g.gw,
      a: g.ptsA,
      b: g.ptsB,
      gap: runA - runB, // positive = A ahead
      winner: g.winner,
    };
  });

  const COLOR_A = "#059669"; // emerald-600
  const COLOR_B = "#e11d48"; // rose-600
  const COLOR_DRAW = "#94a3b8"; // slate-400

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Tab bar */}
      <div className="flex border-b border-slate-100">
        {(["scores", "gap"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-3 text-xs font-semibold transition-colors duration-150 ${
              activeTab === tab
                ? "text-violet-700 border-b-2 border-violet-500 bg-violet-50/40"
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50/60"
            }`}
          >
            {tab === "scores" ? "⚽ GW Scores" : "📈 Cumulative Gap"}
          </button>
        ))}
      </div>

      <div className="px-1 py-4">
        {activeTab === "scores" && (
          <>
            {/* Legend */}
            <div className="flex items-center justify-center gap-5 mb-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_A }} />
                {fnA}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_B }} />
                {fnB}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barCategoryGap="30%" barGap={2} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="gw"
                  tickFormatter={(v) => `${v}`}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "GW", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "#cbd5e1" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  content={<ScoresTooltip fnA={fnA} fnB={fnB} />}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="a" name="a" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.winner === "A"
                          ? COLOR_A
                          : d.winner === "draw"
                          ? COLOR_DRAW
                          : `${COLOR_A}55`
                      }
                    />
                  ))}
                </Bar>
                <Bar dataKey="b" name="b" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.winner === "B"
                          ? COLOR_B
                          : d.winner === "draw"
                          ? COLOR_DRAW
                          : `${COLOR_B}55`
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-center text-[10px] text-slate-300 mt-1">
              Faded bars = losing score · solid = winning score
            </p>
          </>
        )}

        {activeTab === "gap" && (
          <>
            <div className="flex items-center justify-center gap-5 mb-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded inline-block" style={{ background: COLOR_A }} />
                {fnA} ahead
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded inline-block" style={{ background: COLOR_B }} />
                {fnB} ahead
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="gw"
                  tickFormatter={(v) => `${v}`}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "GW", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "#cbd5e1" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />
                <Tooltip
                  content={<GapTooltip fnA={fnA} fnB={fnB} />}
                  cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="gap"
                  stroke="#7c3aed"
                  strokeWidth={2.5}
                  dot={(props) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: { gap: number } };
                    const fill = payload.gap > 0 ? COLOR_A : payload.gap < 0 ? COLOR_B : "#94a3b8";
                    return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3} fill={fill} stroke="white" strokeWidth={1.5} />;
                  }}
                  activeDot={{ r: 5, stroke: "#7c3aed", strokeWidth: 2, fill: "white" }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-center text-[10px] text-slate-300 mt-1">
              Above zero = {fnA} leads · below zero = {fnB} leads
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function H2HTable({ data }: { data: H2HResponse }) {
  const { managerA: a, managerB: b, gws, summary: s } = data;
  const fnA = firstName(a.displayName);
  const fnB = firstName(b.displayName);

  // Running totals for mini-context
  let runningA = 0, runningB = 0;

  const rows = gws.map((g) => {
    runningA += g.ptsA;
    runningB += g.ptsB;
    return { ...g, runA: runningA, runB: runningB };
  });

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <h2 className="text-sm font-semibold text-slate-700">GW-by-GW Breakdown</h2>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300 inline-block" />
            {fnA} wins
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300 inline-block" />
            {fnB} wins
          </span>
        </div>
      </div>

      {/* Biggest win callouts */}
      {(s.biggestWinA || s.biggestWinB) && (
        <div className="flex divide-x divide-slate-100 border-b border-slate-100">
          {s.biggestWinA && (
            <div className="flex-1 px-4 py-2 text-xs">
              <span className="text-slate-400">Biggest {fnA} win: </span>
              <span className="font-semibold text-emerald-700">GW{s.biggestWinA.gw} by {s.biggestWinA.margin} pts</span>
            </div>
          )}
          {s.biggestWinB && (
            <div className="flex-1 px-4 py-2 text-xs">
              <span className="text-slate-400">Biggest {fnB} win: </span>
              <span className="font-semibold text-red-600">GW{s.biggestWinB.gw} by {s.biggestWinB.margin} pts</span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide w-14">GW</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">{fnA}</th>
              <th className="text-center px-2 py-2 text-xs font-semibold text-slate-300 uppercase tracking-wide w-16">Result</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">{fnB}</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide w-20 hidden sm:table-cell">Cumulative</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((g) => {
              const isAWin = g.winner === "A";
              const isBWin = g.winner === "B";
              const rowBg = isAWin
                ? "bg-emerald-50/60"
                : isBWin
                ? "bg-red-50/60"
                : "";

              return (
                <tr key={g.gw} className={rowBg}>
                  {/* GW */}
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-400 tabular-nums">
                    GW{g.gw}
                  </td>

                  {/* A score */}
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        isAWin ? "text-emerald-700" : isBWin ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {g.ptsA}
                    </span>
                  </td>

                  {/* Result badge */}
                  <td className="px-2 py-2.5 text-center">
                    {isAWin && (
                      <span className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                        +{g.margin}
                      </span>
                    )}
                    {isBWin && (
                      <span className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">
                        -{g.margin}
                      </span>
                    )}
                    {g.winner === "draw" && (
                      <span className="inline-flex items-center justify-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                        Draw
                      </span>
                    )}
                  </td>

                  {/* B score */}
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        isBWin ? "text-red-600" : isAWin ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {g.ptsB}
                    </span>
                  </td>

                  {/* Running totals */}
                  <td className="px-4 py-2.5 text-right hidden sm:table-cell">
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        g.runA > g.runB
                          ? "text-emerald-600"
                          : g.runB > g.runA
                          ? "text-red-500"
                          : "text-slate-400"
                      }`}
                    >
                      {g.runA}–{g.runB}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer totals */}
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 flex items-center justify-between text-xs text-slate-500">
        <span>
          {gws.length} GW{gws.length !== 1 ? "s" : ""} played
        </span>
        <span className="tabular-nums font-semibold">
          {fnA} {a.totalPoints} pts · {fnB} {b.totalPoints} pts
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function H2HPage() {
  const { data: orgData } = useQuery<OrgData>({
    queryKey: ["org"],
    queryFn: () => fetch("/api/org").then((r) => r.json()),
    staleTime: 300_000,
  });

  const members = useMemo(() => orgData?.members ?? [], [orgData]);

  const [idA, setIdA] = useState<number | null>(null);
  const [idB, setIdB] = useState<number | null>(null);

  const [quoteA, setQuoteA]     = useState<string | null>(null);
  const [quoteB, setQuoteB]     = useState<string | null>(null);
  const [talkLoading, setTalkLoading] = useState(false);
  const generatedKey = useRef<string | null>(null);

  // Default to first two members once org loads
  const resolvedA = idA ?? members[0]?.managerId ?? null;
  const resolvedB = idB ?? members[1]?.managerId ?? null;

  const enabled = resolvedA !== null && resolvedB !== null;

  const { data, isLoading, isError } = useQuery<H2HResponse, { code?: string }>({
    queryKey: ["h2h", resolvedA, resolvedB],
    queryFn: async () => {
      const r = await fetch(`/api/h2h?a=${resolvedA}&b=${resolvedB}`);
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    enabled,
    staleTime: 300_000,
  });

  // Reset quotes when matchup changes
  useEffect(() => {
    setQuoteA(null);
    setQuoteB(null);
    generatedKey.current = null;
  }, [resolvedA, resolvedB]);

  // Generate trash talk when data loads
  useEffect(() => {
    if (!data) return;
    const key = `trash-${data.managerA.managerId}-${data.managerB.managerId}-gw${data.currentGw}`;
    if (generatedKey.current === key) return;
    generatedKey.current = key;
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached) as { quoteA: string; quoteB: string };
        setQuoteA(parsed.quoteA);
        setQuoteB(parsed.quoteB);
        return;
      }
    } catch { /* ignore */ }
    setTalkLoading(true);
    fetch("/api/trash-talk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentGw: data.currentGw,
        managerA: data.managerA,
        managerB: data.managerB,
        summary: data.summary,
      }),
    })
      .then(async (r) => {
        if (!r.ok) return;
        const json = await r.json() as { quoteA?: string; quoteB?: string };
        if (!json.quoteA || !json.quoteB) return;
        setQuoteA(json.quoteA);
        setQuoteB(json.quoteB);
        try {
          localStorage.setItem(key, JSON.stringify({ quoteA: json.quoteA, quoteB: json.quoteB }));
          for (let g = 1; g < data.currentGw; g++) {
            localStorage.removeItem(`trash-${data.managerA.managerId}-${data.managerB.managerId}-gw${g}`);
            localStorage.removeItem(`trash-${data.managerB.managerId}-${data.managerA.managerId}-gw${g}`);
          }
        } catch { /* ignore */ }
      })
      .catch(() => { /* silently absent */ })
      .finally(() => setTalkLoading(false));
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">H2H Battle Simulator</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Head-to-head record for every gameweek of the season
        </p>
      </div>

      {/* Manager selectors */}
      <div className="bg-white border border-slate-200/80 rounded-xl px-4 py-4 shadow-card">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <ManagerSelect
            label="Manager A"
            members={members}
            value={resolvedA}
            onChange={setIdA}
            exclude={resolvedB}
          />

          <div className="shrink-0 text-slate-300 font-black text-lg sm:mt-5">VS</div>

          <ManagerSelect
            label="Manager B"
            members={members}
            value={resolvedB}
            onChange={setIdB}
            exclude={resolvedA}
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <div className="h-48 bg-[#37003c]/10 rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load H2H data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {/* Trash talk weigh-in */}
      {(talkLoading || quoteA || quoteB) && data && (
        <TrashTalkCard
          quoteA={quoteA}
          quoteB={quoteB}
          nameA={firstName(data.managerA.displayName)}
          nameB={firstName(data.managerB.displayName)}
          loading={talkLoading}
        />
      )}

      {/* Content */}
      {data && !isLoading && (
        <div className="space-y-5">
          <RivalryCard data={data} />
          <H2HCharts data={data} />
          <H2HTable data={data} />
        </div>
      )}

      {/* Empty state */}
      {!enabled && members.length < 2 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          At least 2 active members are required for H2H. Configure your org in{" "}
          <a href="/admin" className="font-semibold underline">Admin</a>.
        </div>
      )}
    </div>
  );
}
