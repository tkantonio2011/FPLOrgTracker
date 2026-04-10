import Link from "next/link";
import { ScoreCard } from "./ScoreCard";

interface StandingEntry {
  rank: number;
  rankChange: number;
  managerId: number;
  displayName: string;
  teamName: string;
  gameweekPoints: number;
  totalPoints: number;
  overallRank: number;
  chipUsed: string | null;
  pointsBehindLeader: number;
}

interface ManagerTitle {
  managerId: number;
  title: string;
  description: string;
  colour: string;
  border: string;
}

interface LeaderboardTableProps {
  standings: StandingEntry[];
  orgAverageGwPoints: number;
  globalAverageGwPoints: number;
  titles?: Map<number, ManagerTitle>;
}

export function LeaderboardTable({ standings, orgAverageGwPoints, globalAverageGwPoints, titles }: LeaderboardTableProps) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Column header */}
      {standings.length > 0 && (
        <div className="flex items-center gap-3 py-2 px-4 bg-slate-50/80 border-b border-slate-100">
          <div className="w-9 shrink-0" />
          <div className="w-7 shrink-0" />
          <div className="flex-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Manager</div>
          <div className="w-16 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">GW</div>
          <div className="w-20 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">Total</div>
        </div>
      )}

      <div className="divide-y divide-slate-50">
        {standings.map((entry, idx) => {
          const total       = standings.length;
          const safetyLine  = total - 3; // last safe rank (0-indexed: positions 0..safetyLine-1 are safe)
          const inDanger    = total >= 4 && entry.rank > safetyLine;
          // depthInZone: 1 = just in danger, 3 = rock bottom
          const depthInZone = inDanger ? entry.rank - safetyLine : 0;
          const showSeparator = total >= 4 && idx > 0 && standings[idx - 1].rank === safetyLine;

          return (
            <div key={entry.managerId}>
              {/* Relegation zone separator */}
              {showSeparator && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-red-50 border-t border-b border-red-200/70">
                  <div className="flex-1 h-px bg-red-300/50" />
                  <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest shrink-0 flex items-center gap-1">
                    <span>⚠️</span> Relegation Zone
                  </span>
                  <div className="flex-1 h-px bg-red-300/50" />
                </div>
              )}
              <Link
                href={`/members/${entry.managerId}`}
                className="block transition-colors duration-100 cursor-pointer"
              >
                <ScoreCard
                  {...entry}
                  title={titles?.get(entry.managerId)}
                  inDanger={inDanger}
                  depthInZone={depthInZone}
                />
              </Link>
            </div>
          );
        })}

        {standings.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm">No standings data yet.</p>
            <p className="text-slate-300 text-xs mt-1">Configure your league in Admin to get started.</p>
          </div>
        )}
      </div>

      {/* Averages footer */}
      {standings.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 flex gap-6 text-xs text-slate-400">
          <span>
            Org avg:{" "}
            <strong className="text-slate-600 tabular">{orgAverageGwPoints} pts</strong>
          </span>
          <span>
            FPL avg:{" "}
            <strong className="text-slate-600 tabular">{globalAverageGwPoints} pts</strong>
          </span>
        </div>
      )}
    </div>
  );
}
