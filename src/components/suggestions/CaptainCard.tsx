"use client";

import { Badge, playerStatusVariant } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";

const POSITION_LABELS: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

interface CaptainSuggestion {
  rank: number;
  player: {
    id: number;
    webName: string;
    teamShortName: string;
    form: string;
    status: string;
    news: string;
    elementType: number;
  };
  fixture: {
    opponent: string;
    isHome: boolean;
    difficulty: number;
    isDgw: boolean;
  };
  isDifferential: boolean;
  orgOwnershipPercent: number;
  reasoning: string;
  score: number;
}

const FDR_COLORS: Record<number, { dot: string; label: string }> = {
  1: { dot: "bg-emerald-500", label: "text-emerald-700" },
  2: { dot: "bg-lime-400", label: "text-lime-700" },
  3: { dot: "bg-amber-400", label: "text-amber-700" },
  4: { dot: "bg-orange-500", label: "text-orange-700" },
  5: { dot: "bg-red-600", label: "text-red-700" },
};

function FdrPip({ difficulty }: { difficulty: number }) {
  const idx = Math.min(5, Math.max(1, difficulty));
  const { dot } = FDR_COLORS[idx] ?? { dot: "bg-slate-300" };
  return <span className={`inline-block w-2 h-2 rounded-full ${dot}`} title={`FDR ${difficulty}`} />;
}

export function CaptainCard({ suggestion }: { suggestion: CaptainSuggestion }) {
  const { rank, player, fixture, isDifferential, orgOwnershipPercent, reasoning } = suggestion;
  const isRisky = player.status === "d" || player.status === "i" || player.status === "s";

  const isTop = rank === 1;

  return (
    <Card className={isTop ? "ring-2 ring-[#37003c]/20" : ""}>
      {isTop && (
        <div className="px-5 pt-3 pb-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#37003c]/60">Top Pick</span>
        </div>
      )}
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          {/* Rank bubble */}
          <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-black text-sm ${
            isTop
              ? "bg-[#37003c] text-[#00ff87]"
              : "bg-slate-100 text-slate-500"
          }`}>
            #{rank}
          </div>

          <div className="flex-1 min-w-0">
            {/* Player name + badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-900 text-base">{player.webName}</span>
              <Badge variant="default">{POSITION_LABELS[player.elementType] ?? "?"}</Badge>
              <span className="text-xs text-slate-400 font-medium">{player.teamShortName}</span>
              {fixture.isDgw && <Badge variant="chip">DGW</Badge>}
              {isDifferential && <Badge variant="info">Differential</Badge>}
            </div>

            {/* Fixture */}
            <div className="flex items-center gap-1.5 mt-1.5 text-sm text-slate-500">
              <FdrPip difficulty={fixture.difficulty} />
              <span>
                vs <strong className="text-slate-700">{fixture.opponent}</strong>{" "}
                ({fixture.isHome ? "H" : "A"}) · FDR {fixture.difficulty}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-1.5">
              <div className="text-xs text-slate-400">
                Form <strong className="text-slate-700 tabular">{player.form}</strong>
              </div>
              <div className="text-xs text-slate-400">
                Org ownership <strong className="text-slate-700 tabular">{orgOwnershipPercent}%</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Injury warning */}
        {isRisky && player.news && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2 flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0 mt-0.5">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <path d="M12 9v4"/>
              <path d="M12 17h.01"/>
            </svg>
            <p className="text-xs text-amber-700">{player.news}</p>
          </div>
        )}

        {/* Reasoning */}
        <p className="text-xs text-slate-400 italic leading-relaxed">{reasoning}</p>
      </CardBody>
    </Card>
  );
}
