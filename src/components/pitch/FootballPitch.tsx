"use client";

// ─── Premier League team kit colors (2024/25) ────────────────────────────────
// body = shirt body color, sleeve = sleeve/secondary color
const TEAM_COLORS: Record<string, { body: string; sleeve: string }> = {
  ARS: { body: "#EF0107", sleeve: "#FFFFFF" }, // Arsenal – red/white
  AVL: { body: "#670E36", sleeve: "#94BEE5" }, // Aston Villa – claret/sky
  BOU: { body: "#DA291C", sleeve: "#101010" }, // Bournemouth – red/black
  BRE: { body: "#E30613", sleeve: "#FFFFFF" }, // Brentford – red/white
  BHA: { body: "#0057B8", sleeve: "#FFFFFF" }, // Brighton – blue/white
  CHE: { body: "#034694", sleeve: "#FFFFFF" }, // Chelsea – blue/white
  CRY: { body: "#1B458F", sleeve: "#C4122E" }, // Crystal Palace – blue/red
  EVE: { body: "#003399", sleeve: "#FFFFFF" }, // Everton – blue/white
  FUL: { body: "#CC0000", sleeve: "#000000" }, // Fulham – red/black (away)
  IPS: { body: "#1D5299", sleeve: "#FFFFFF" }, // Ipswich – blue/white
  LEI: { body: "#003090", sleeve: "#FDBE11" }, // Leicester – blue/yellow
  LIV: { body: "#C8102E", sleeve: "#00A398" }, // Liverpool – red/teal trim
  MCI: { body: "#6CABDD", sleeve: "#FFFFFF" }, // Man City – sky/white
  MUN: { body: "#DA291C", sleeve: "#FBE122" }, // Man Utd – red/yellow
  NEW: { body: "#241F20", sleeve: "#FFFFFF" }, // Newcastle – black/white
  NFO: { body: "#DD0000", sleeve: "#FFFFFF" }, // Nottm Forest – red/white
  SOU: { body: "#D71920", sleeve: "#FFFFFF" }, // Southampton – red/white
  TOT: { body: "#FFFFFF", sleeve: "#132257" }, // Tottenham – white/navy
  WHU: { body: "#7A263A", sleeve: "#1BB1E7" }, // West Ham – claret/blue
  WOL: { body: "#FDB913", sleeve: "#231F20" }, // Wolves – gold/black
};

const FALLBACK = { body: "#475569", sleeve: "#94a3b8" };

function kitColors(team: string) {
  return TEAM_COLORS[team] ?? FALLBACK;
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PitchPick {
  position: number;      // squad slot 1-15
  playerId: number;
  webName: string;
  teamShortName: string;
  elementType: number;   // 1=GK 2=DEF 3=MID 4=FWD
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  points: number;
  status: string;
}

// ─── SVG layout constants ────────────────────────────────────────────────────
const VW = 360;
const VH = 404;

// Pitch rectangle within the viewBox
const PX = 10;
const PY = 10;
const PW = 340;
const PH = 382;

// Y-center of each player row — attack at top, GK at bottom
const ROW_Y: Record<number, number> = {
  4: 82,   // FWD
  3: 180,  // MID
  2: 280,  // DEF
  1: 352,  // GK
};

// Shirt rendered size in main-SVG units (scaled from 48×52 inner viewBox)
const SHIRT_W = 38;
const SHIRT_H = 41;

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Evenly distribute N players across the pitch width */
function playerX(count: number, index: number): number {
  const gap = (PW - 60) / (count + 1);
  return PX + 30 + gap * (index + 1);
}

function statusColor(status: string): string | null {
  if (status === "i" || status === "s") return "#ef4444";
  if (status === "d") return "#f59e0b";
  return null;
}

// ─── Kit shirt SVG path (48×52 viewBox) ─────────────────────────────────────
//
//  Left collar (16,4) — right collar (32,4) — V-neck dip (24,14)
//  Sleeves extend out to (0,14) left / (48,14) right
//  Body runs x=12…36 from y=22 to y=52
//
const SHIRT_PATH = "M16 4 L0 14 L6 24 L12 22 L12 52 L36 52 L36 22 L42 24 L48 14 L32 4 L24 14 Z";
const LEFT_SLEEVE = "M16 4 L0 14 L6 24 L12 22 Z";
const RIGHT_SLEEVE = "M32 4 L48 14 L42 24 L36 22 Z";
const COLLAR_V = "M16 4 L24 14 L32 4";

// ─── PlayerToken ─────────────────────────────────────────────────────────────
function PlayerToken({
  pick,
  cx,
  cy,
}: {
  pick: PitchPick;
  cx: number;
  cy: number;
}) {
  const kit = kitColors(pick.teamShortName);
  const pts = pick.points * pick.multiplier;
  const name =
    pick.webName.length > 10 ? pick.webName.slice(0, 9) + "…" : pick.webName;
  const dot = statusColor(pick.status);
  const isHighScore = pts >= 8;

  // Stroke for shirts that would otherwise be invisible (white / gold)
  const border =
    kit.body === "#FFFFFF" || kit.body === "#FDB913"
      ? "#d1d5db"
      : "rgba(0,0,0,0.15)";

  const sx = cx - SHIRT_W / 2;
  const sy = cy - SHIRT_H / 2;

  return (
    <g>
      {/* ── Shirt icon (nested SVG for its own viewBox) ────── */}
      <svg x={sx} y={sy} width={SHIRT_W} height={SHIRT_H} viewBox="0 0 48 52" overflow="visible">
        {/* Body fill */}
        <path d={SHIRT_PATH} fill={kit.body} stroke={border} strokeWidth="1.5" />
        {/* Left sleeve secondary color */}
        <path d={LEFT_SLEEVE} fill={kit.sleeve} opacity="0.92" />
        {/* Right sleeve secondary color */}
        <path d={RIGHT_SLEEVE} fill={kit.sleeve} opacity="0.92" />
        {/* Collar V accent line */}
        <path d={COLLAR_V} fill="none" stroke={kit.sleeve} strokeWidth="2" opacity="0.7" />
        {/* Sheen overlay (references gradient from parent SVG defs) */}
        <path d={SHIRT_PATH} fill="url(#shirtSheen)" />

        {/* Status indicator dot */}
        {dot && (
          <circle cx="7" cy="9" r="5" fill={dot} stroke="white" strokeWidth="1" />
        )}

        {/* Captain badge */}
        {pick.isCaptain && (
          <>
            <circle cx="41" cy="9" r="7.5" fill="#00ff87" />
            <text
              x="41"
              y="13.5"
              textAnchor="middle"
              fontSize={pick.multiplier === 3 ? "5.5" : "8"}
              fontWeight="800"
              fill="#37003c"
            >
              {pick.multiplier === 3 ? "3×C" : "C"}
            </text>
          </>
        )}

        {/* Vice-captain badge */}
        {!pick.isCaptain && pick.isViceCaptain && (
          <>
            <circle
              cx="41"
              cy="9"
              r="7.5"
              fill="rgba(255,255,255,0.95)"
              stroke="rgba(0,0,0,0.08)"
              strokeWidth="0.5"
            />
            <text
              x="41"
              y="13.5"
              textAnchor="middle"
              fontSize="6.5"
              fontWeight="700"
              fill="#374151"
            >
              VC
            </text>
          </>
        )}
      </svg>

      {/* ── Player name ────────────────────────────────────── */}
      <text
        x={cx}
        y={cy + SHIRT_H / 2 + 13}
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="600"
        fill="white"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="3"
        paintOrder="stroke fill"
      >
        {name}
      </text>

      {/* ── Points pill ────────────────────────────────────── */}
      <rect
        x={cx - 14}
        y={cy + SHIRT_H / 2 + 16}
        width={28}
        height={13}
        rx={6.5}
        fill={isHighScore ? "#00ff87" : "rgba(0,0,0,0.45)"}
      />
      <text
        x={cx}
        y={cy + SHIRT_H / 2 + 26}
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill={isHighScore ? "#37003c" : "white"}
      >
        {pts}
      </text>
    </g>
  );
}

// ─── FootballPitch ────────────────────────────────────────────────────────────
export function FootballPitch({ picks }: { picks: PitchPick[] }) {
  const starters = [...picks]
    .filter((p) => p.isStarting)
    .sort((a, b) => a.position - b.position);
  const bench = [...picks]
    .filter((p) => !p.isStarting)
    .sort((a, b) => a.position - b.position);

  // Group starters by element type
  const byType: Record<number, PitchPick[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of starters) {
    byType[p.elementType]?.push(p);
  }

  return (
    <div className="space-y-4">
      {/* ── Pitch SVG ─────────────────────────────────────── */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full max-w-[420px] mx-auto rounded-xl"
        role="img"
        aria-label="Football pitch showing squad formation and kit colours"
      >
        <defs>
          {/* Pitch grass gradient (top to bottom) */}
          <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" />
            <stop offset="50%" stopColor="#15803d" />
            <stop offset="100%" stopColor="#166534" />
          </linearGradient>

          {/* Shirt light-sheen overlay — shared by all nested shirt SVGs */}
          <linearGradient id="shirtSheen" x1="0.25" y1="0" x2="0.75" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.14)" />
          </linearGradient>

          {/* Clip to pitch rounded rectangle */}
          <clipPath id="pitchClip">
            <rect x={PX} y={PY} width={PW} height={PH} rx="8" />
          </clipPath>
        </defs>

        {/* ── Grass base ─────────────────────────────────── */}
        <rect x={PX} y={PY} width={PW} height={PH} fill="url(#pitchGrad)" rx="8" />

        {/* Alternating grass stripes */}
        <g clipPath="url(#pitchClip)">
          {Array.from({ length: 10 }).map((_, i) =>
            i % 2 === 0 ? (
              <rect
                key={i}
                x={PX}
                y={PY + (i * PH) / 10}
                width={PW}
                height={PH / 10}
                fill="rgba(0,0,0,0.045)"
              />
            ) : null
          )}
        </g>

        {/* ── Pitch markings ────────────────────────────── */}
        <g
          stroke="rgba(255,255,255,0.38)"
          strokeWidth="1.5"
          fill="none"
          clipPath="url(#pitchClip)"
        >
          {/* Pitch border */}
          <rect x={PX + 10} y={PY + 10} width={PW - 20} height={PH - 20} />

          {/* Halfway line */}
          <line
            x1={PX + 10}
            y1={PY + PH / 2}
            x2={PX + PW - 10}
            y2={PY + PH / 2}
          />

          {/* Centre circle */}
          <circle cx={PX + PW / 2} cy={PY + PH / 2} r={40} />
          {/* Centre spot */}
          <circle
            cx={PX + PW / 2}
            cy={PY + PH / 2}
            r={3}
            fill="rgba(255,255,255,0.45)"
            stroke="none"
          />

          {/* Top penalty area */}
          <rect
            x={PX + PW * 0.21}
            y={PY + 10}
            width={PW * 0.58}
            height={PH * 0.15}
          />
          {/* Top 6-yard box */}
          <rect
            x={PX + PW * 0.36}
            y={PY + 10}
            width={PW * 0.28}
            height={PH * 0.055}
          />
          {/* Top penalty spot */}
          <circle
            cx={PX + PW / 2}
            cy={PY + PH * 0.135}
            r={2.5}
            fill="rgba(255,255,255,0.45)"
            stroke="none"
          />

          {/* Bottom penalty area */}
          <rect
            x={PX + PW * 0.21}
            y={PY + PH - 10 - PH * 0.15}
            width={PW * 0.58}
            height={PH * 0.15}
          />
          {/* Bottom 6-yard box */}
          <rect
            x={PX + PW * 0.36}
            y={PY + PH - 10 - PH * 0.055}
            width={PW * 0.28}
            height={PH * 0.055}
          />
          {/* Bottom penalty spot */}
          <circle
            cx={PX + PW / 2}
            cy={PY + PH - PH * 0.135}
            r={2.5}
            fill="rgba(255,255,255,0.45)"
            stroke="none"
          />
        </g>

        {/* ── Starting XI ────────────────────────────────── */}
        {([4, 3, 2, 1] as const).map((et) =>
          byType[et].map((pick, i) => (
            <PlayerToken
              key={pick.playerId}
              pick={pick}
              cx={playerX(byType[et].length, i)}
              cy={ROW_Y[et]}
            />
          ))
        )}
      </svg>

      {/* ── Bench section (HTML, below pitch) ─────────────── */}
      {bench.length > 0 && (
        <div className="px-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
              Bench
            </span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
          <div className="flex items-start justify-center gap-3 flex-wrap">
            {bench.map((pick) => (
              <BenchToken key={pick.playerId} pick={pick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BenchToken (HTML component for bench players) ───────────────────────────
function BenchToken({ pick }: { pick: PitchPick }) {
  const kit = kitColors(pick.teamShortName);
  const pts = pick.points * pick.multiplier;
  const name =
    pick.webName.length > 10 ? pick.webName.slice(0, 9) + "…" : pick.webName;
  const dot = statusColor(pick.status);

  const border =
    kit.body === "#FFFFFF" || kit.body === "#FDB913"
      ? "#d1d5db"
      : "rgba(0,0,0,0.12)";

  return (
    <div className="flex flex-col items-center gap-1 w-[60px]">
      {/* Shirt */}
      <svg width="34" height="37" viewBox="0 0 48 52">
        <path
          d={SHIRT_PATH}
          fill={kit.body}
          stroke={border}
          strokeWidth="1.5"
          opacity="0.7"
        />
        <path d={LEFT_SLEEVE} fill={kit.sleeve} opacity="0.65" />
        <path d={RIGHT_SLEEVE} fill={kit.sleeve} opacity="0.65" />
        <path
          d={COLLAR_V}
          fill="none"
          stroke={kit.sleeve}
          strokeWidth="2"
          opacity="0.6"
        />
        {dot && (
          <circle cx="7" cy="9" r="4.5" fill={dot} stroke="white" strokeWidth="1" />
        )}
      </svg>

      {/* Name */}
      <span className="text-[9px] font-semibold text-slate-500 text-center leading-tight w-full truncate">
        {name}
      </span>

      {/* Points */}
      <span
        className={`text-[9px] font-bold tabular px-1.5 py-0.5 rounded-full leading-tight ${
          pts >= 8
            ? "bg-[#00ff87] text-[#37003c]"
            : "text-slate-400"
        }`}
      >
        {pts}
      </span>
    </div>
  );
}
