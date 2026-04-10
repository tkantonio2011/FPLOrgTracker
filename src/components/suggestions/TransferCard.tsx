"use client";

import { Badge, playerStatusVariant } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";

interface TransferSuggestion {
  rank: number;
  playerOut: {
    id: number;
    webName: string;
    nowCost: number;
    status: string;
    news: string;
    form: string;
    avgFdr: number;
  };
  playerIn: {
    id: number;
    webName: string;
    nowCost: number;
    form: string;
    upcomingFdr: number;
    teamShortName: string;
    status: string;
  };
  isFreeTransfer: boolean;
  reasoning: string;
  score: number;
}

const FDR_DOT_COLORS: Record<number, string> = {
  1: "bg-emerald-500",
  2: "bg-lime-400",
  3: "bg-amber-400",
  4: "bg-orange-500",
  5: "bg-red-600",
};

function FdrDot({ fdr }: { fdr: number }) {
  const rounded = Math.round(Math.max(1, Math.min(5, fdr)));
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${FDR_DOT_COLORS[rounded] ?? "bg-slate-300"}`}
      title={`FDR ${rounded}`}
    />
  );
}

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 shrink-0">
    <path d="M5 12h14"/>
    <path d="m12 5 7 7-7 7"/>
  </svg>
);

export function TransferCard({ suggestion }: { suggestion: TransferSuggestion }) {
  const { rank, playerOut, playerIn, isFreeTransfer, reasoning } = suggestion;
  const costDiff = playerIn.nowCost - playerOut.nowCost;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {/* Rank bubble */}
        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-black text-xs bg-slate-100 text-slate-500">
          #{rank}
        </div>

        {/* Player OUT */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-semibold text-slate-800 truncate text-sm">{playerOut.webName}</span>
            {(playerOut.status === "i" || playerOut.status === "s") && (
              <Badge variant={playerStatusVariant(playerOut.status)} className="shrink-0">
                {playerOut.status === "i" ? "INJ" : "SUS"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="tabular">Form {playerOut.form}</span>
            <FdrDot fdr={playerOut.avgFdr} />
            <span className="tabular">FDR {playerOut.avgFdr.toFixed(1)}</span>
          </div>
        </div>

        <ArrowIcon />

        {/* Player IN */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-semibold text-slate-900 truncate text-sm">{playerIn.webName}</span>
            <span className="text-xs text-slate-400 shrink-0 font-medium">{playerIn.teamShortName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="tabular">Form {playerIn.form}</span>
            <FdrDot fdr={playerIn.upcomingFdr} />
            <span
              className={`tabular font-medium ${
                costDiff > 0 ? "text-red-500" : costDiff < 0 ? "text-emerald-600" : "text-slate-400"
              }`}
            >
              {costDiff > 0
                ? `+£${(costDiff / 10).toFixed(1)}m`
                : costDiff < 0
                ? `−£${(Math.abs(costDiff) / 10).toFixed(1)}m`
                : "same price"}
            </span>
          </div>
        </div>

        {/* Transfer type badge */}
        <div className="shrink-0">
          {isFreeTransfer ? (
            <Badge variant="success">Free</Badge>
          ) : (
            <Badge variant="warning">−4 pts</Badge>
          )}
        </div>
      </div>

      {/* Reasoning */}
      <div className="px-4 pb-3 border-t border-slate-50 pt-2.5">
        <p className="text-xs text-slate-400 italic leading-relaxed">{reasoning}</p>
      </div>
    </Card>
  );
}
