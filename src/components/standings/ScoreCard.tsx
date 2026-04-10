import { Badge, chipLabel } from "@/components/ui/Badge";

interface ManagerTitle {
  managerId: number;
  title: string;
  description: string;
  colour: string;
  border: string;
}

interface ScoreCardProps {
  rank: number;
  rankChange: number;
  displayName: string;
  teamName: string;
  gameweekPoints: number;
  totalPoints: number;
  overallRank: number;
  chipUsed: string | null;
  pointsBehindLeader: number;
  isCurrentUser?: boolean;
  title?: ManagerTitle;
  inDanger?: boolean;
  depthInZone?: number; // 1 = just in danger, 3 = rock bottom
}

const rankMedal: Record<number, { bg: string; text: string }> = {
  1: { bg: "bg-amber-400/15 text-amber-600 ring-1 ring-amber-400/40", text: "🥇" },
  2: { bg: "bg-slate-300/20 text-slate-500 ring-1 ring-slate-300/60", text: "🥈" },
  3: { bg: "bg-orange-400/15 text-orange-600 ring-1 ring-orange-300/50", text: "🥉" },
};

// Danger zone colour config indexed by depthInZone (1–3)
const DANGER_CONFIG = [
  null, // index 0 — unused
  { rowBg: "bg-red-50/40",  bar: "bg-amber-400", barW: "w-1/3",  badge: "bg-amber-100 text-amber-700 border-amber-200" },
  { rowBg: "bg-red-50/60",  bar: "bg-orange-500", barW: "w-2/3", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  { rowBg: "bg-red-50/80",  bar: "bg-red-600",    barW: "w-full", badge: "bg-red-100 text-red-700 border-red-200" },
];

export function ScoreCard({
  rank,
  rankChange,
  displayName,
  teamName,
  gameweekPoints,
  totalPoints,
  chipUsed,
  pointsBehindLeader,
  isCurrentUser,
  title,
  inDanger,
  depthInZone = 0,
}: ScoreCardProps) {
  const rankArrow = rankChange > 0 ? "▲" : rankChange < 0 ? "▼" : "—";
  const rankColor =
    rankChange > 0 ? "text-emerald-500" : rankChange < 0 ? "text-red-400" : "text-slate-300";
  const medal   = rankMedal[rank];
  const danger  = inDanger ? DANGER_CONFIG[Math.min(depthInZone, 3)] : null;

  return (
    <div
      className={`flex flex-col transition-colors duration-100 hover:brightness-[0.97] ${
        danger ? danger.rowBg : isCurrentUser ? "bg-[#37003c]/[0.04]" : "hover:bg-slate-50/60"
      }`}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 py-3 px-4">
        {/* Rank badge */}
        <div className="w-9 shrink-0 flex justify-center">
          {medal ? (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${medal.bg}`}>
              {rank}
            </div>
          ) : (
            <span className="text-base font-bold text-slate-400 tabular">{rank}</span>
          )}
        </div>

        {/* Rank change */}
        <div className={`w-7 shrink-0 flex flex-col items-center text-[10px] font-semibold ${rankColor}`}>
          <span className="leading-none">{rankArrow}</span>
          {Math.abs(rankChange) > 0 && (
            <span className="leading-none text-[9px] opacity-80">{Math.abs(rankChange)}</span>
          )}
        </div>

        {/* Member info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 truncate text-sm">{displayName}</span>
            {chipUsed && <Badge variant="chip">{chipLabel(chipUsed)}</Badge>}
            {danger && (
              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${danger.badge}`}>
                DANGER
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">{teamName}</div>
          {title && (
            <div
              className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${title.colour} ${title.border}`}
              title={title.description}
            >
              {title.title}
            </div>
          )}
        </div>

        {/* GW points */}
        <div className="text-right w-12 sm:w-16 shrink-0">
          <div className="text-base sm:text-lg font-bold text-[#37003c] tabular leading-tight">{gameweekPoints}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">GW</div>
        </div>

        {/* Total + gap */}
        <div className="text-right w-14 sm:w-20 shrink-0">
          <div className="text-sm font-semibold text-slate-700 tabular">{totalPoints}</div>
          {pointsBehindLeader > 0 ? (
            <div className="text-[10px] text-red-400 tabular">−{pointsBehindLeader}</div>
          ) : (
            <div className="text-[10px] font-semibold" style={{ color: "#00c470" }}>Leader</div>
          )}
        </div>
      </div>

      {/* Relegation depth bar */}
      {danger && (
        <div className="h-1 w-full bg-red-100/60">
          <div className={`h-full ${danger.bar} ${danger.barW} transition-all duration-500`} />
        </div>
      )}
    </div>
  );
}
