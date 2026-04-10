"use client";

import { useState } from "react";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { FootballPitch } from "@/components/pitch/FootballPitch";

interface Pick {
  position: number;
  playerId: number;
  webName: string;
  teamShortName: string;
  elementType: number;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  points: number;
  epNext: number;
  status: string;
  news: string;
}

interface PlayerContributionListProps {
  picks: Pick[];
  gameweekId: number;
}

const ELEMENT_TYPE_LABELS: Record<number, string> = {
  1: "GK",
  2: "DEF",
  3: "MID",
  4: "FWD",
};

// ─── Tab icons ────────────────────────────────────────────────────────────────
const TableIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
  </svg>
);

const PitchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="18" rx="2"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M7 3v4M17 3v4M7 17v4M17 17v4"/>
  </svg>
);

// ─── Main component ───────────────────────────────────────────────────────────
export function PlayerContributionList({ picks, gameweekId }: PlayerContributionListProps) {
  const [view, setView] = useState<"pitch" | "table">("pitch");

  const sorted = [...picks].sort((a, b) => a.position - b.position);

  const predictedTotal = sorted
    .filter((p) => p.isStarting)
    .reduce((sum, p) => sum + p.epNext * p.multiplier, 0);

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-800">GW {gameweekId} Squad</h3>

        <div className="flex items-center gap-3">
          {/* Predicted total */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs">Next GW predicted:</span>
            <span className="font-bold text-[#37003c] tabular">{predictedTotal.toFixed(1)} pts</span>
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <button
              onClick={() => setView("pitch")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer ${
                view === "pitch"
                  ? "bg-[#37003c] text-[#00ff87]"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <PitchIcon />
              Pitch
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer ${
                view === "table"
                  ? "bg-[#37003c] text-[#00ff87]"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <TableIcon />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* ── Pitch view ─────────────────────────────────────── */}
      {view === "pitch" && (
        <div className="p-4 bg-slate-50/40">
          <FootballPitch picks={picks} />
        </div>
      )}

      {/* ── Table view ─────────────────────────────────────── */}
      {view === "table" && (
        <Table>
          <Thead>
            <Tr>
              <Th>Pos</Th>
              <Th>Player</Th>
              <Th>Team</Th>
              <Th className="text-right">GW pts</Th>
              <Th className="text-right">xPts next</Th>
              <Th>Badges</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sorted.map((pick, index) => {
              const showBenchDivider =
                index > 0 &&
                sorted[index - 1].position === 11 &&
                pick.position === 12;

              const predictedWithMultiplier = pick.epNext * pick.multiplier;

              return (
                <>
                  {showBenchDivider && (
                    <Tr key={`bench-divider-${pick.playerId}`} className="bg-slate-50/80">
                      <Td
                        colSpan={6}
                        className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest py-2"
                      >
                        Bench
                      </Td>
                    </Tr>
                  )}
                  <Tr key={pick.playerId} className={!pick.isStarting ? "opacity-70" : ""}>
                    <Td>
                      <span className="text-xs font-medium text-slate-400">
                        {ELEMENT_TYPE_LABELS[pick.elementType] ?? pick.position}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-medium text-slate-900">{pick.webName}</span>
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-400 font-medium">{pick.teamShortName}</span>
                    </Td>
                    <Td className="text-right">
                      <span
                        className={`font-bold tabular ${pick.multiplier > 1 ? "text-[#37003c]" : "text-slate-800"}`}
                      >
                        {pick.points * pick.multiplier}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span
                        className={`font-semibold tabular ${
                          predictedWithMultiplier >= 8
                            ? "text-emerald-600"
                            : predictedWithMultiplier >= 5
                            ? "text-amber-600"
                            : "text-slate-400"
                        }`}
                      >
                        {predictedWithMultiplier.toFixed(1)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1 flex-wrap">
                        {pick.isCaptain && <Badge variant="purple">C</Badge>}
                        {pick.isViceCaptain && <Badge variant="info">VC</Badge>}
                        {!pick.isStarting && <Badge variant="default">B</Badge>}
                        {(pick.status === "i" || pick.status === "s") && (
                          <Badge variant="danger">{pick.status === "i" ? "INJ" : "SUS"}</Badge>
                        )}
                      </div>
                    </Td>
                  </Tr>
                </>
              );
            })}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
