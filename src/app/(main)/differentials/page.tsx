"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

const POSITION_LABEL: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };
const POSITION_COLOUR: Record<number, string> = {
  1: "bg-yellow-100 text-yellow-700",
  2: "bg-blue-100 text-blue-700",
  3: "bg-emerald-100 text-emerald-700",
  4: "bg-red-100 text-red-700",
};
const FDR_COLOUR: Record<number, string> = {
  1: "bg-emerald-600 text-white",
  2: "bg-lime-400 text-slate-800",
  3: "bg-slate-300 text-slate-700",
  4: "bg-orange-400 text-white",
  5: "bg-red-600 text-white",
};

type SortKey = "swing" | "form" | "ep" | "owned";
type PosFilter = 0 | 1 | 2 | 3 | 4; // 0 = all

interface NextFixture {
  opponent: string;
  fdr: number;
  isHome: boolean;
  kickoffTime: string | null;
}

interface Differential {
  playerId: number;
  webName: string;
  fullName: string;
  team: string;
  elementType: number;
  nowCost: number;
  form: number;
  epThis: number;
  epNext: number;
  swingScore: number;
  ownerCount: number;
  totalMembers: number;
  orgOwnerPercent: number;
  owners: string[];
  nonOwners: string[];
  nextFixture: NextFixture | null;
}

interface DifferentialsResponse {
  gameweekId: number;
  gameweekName: string;
  totalMembers: number;
  differentials: Differential[];
}

// Ownership split bar: shows proportion owned / not owned
function OwnershipBar({
  ownerCount,
  totalMembers,
  owners,
  nonOwners,
}: Pick<Differential, "ownerCount" | "totalMembers" | "owners" | "nonOwners">) {
  const ownedPct = (ownerCount / totalMembers) * 100;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-bold text-slate-700 tabular-nums">
          {ownerCount}/{totalMembers}
        </span>
        <span className="text-xs text-slate-400">own</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
        <div
          className="h-full bg-emerald-400 rounded-full transition-all duration-300"
          style={{ width: `${ownedPct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
        {owners.map((n) => (
          <span key={n} className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {n}
          </span>
        ))}
        {nonOwners.map((n) => (
          <span key={n} className="text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function SwingBadge({ score, epNext }: { score: number; epNext: number }) {
  const isHigh = score >= 15;
  const isMed = score >= 8;
  return (
    <div className="text-right shrink-0">
      <div className={`text-lg font-black tabular-nums ${isHigh ? "text-red-600" : isMed ? "text-amber-600" : "text-slate-600"}`}>
        {score > 0 ? score.toFixed(1) : "—"}
      </div>
      <div className="text-[10px] text-slate-400 font-medium">swing</div>
      {epNext > 0 && (
        <div className="text-[10px] text-slate-400 mt-0.5">
          ep: <span className="font-semibold text-slate-600">{epNext.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

export default function DifferentialsPage() {
  const [posFilter, setPosFilter] = useState<PosFilter>(0);
  const [sortKey, setSortKey] = useState<SortKey>("swing");
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isError } = useQuery<DifferentialsResponse>({
    queryKey: ["differentials"],
    queryFn: async () => {
      const r = await fetch("/api/differentials");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = posFilter === 0
      ? data.differentials
      : data.differentials.filter((d) => d.elementType === posFilter);

    list = [...list].sort((a, b) => {
      if (sortKey === "swing") return b.swingScore - a.swingScore;
      if (sortKey === "form") return b.form - a.form;
      if (sortKey === "ep") return b.epNext - a.epNext;
      if (sortKey === "owned") {
        // Closest to 50/50 first
        const aSplit = Math.abs(a.orgOwnerPercent - 50);
        const bSplit = Math.abs(b.orgOwnerPercent - 50);
        return aSplit - bSplit;
      }
      return 0;
    });

    return list;
  }, [data, posFilter, sortKey]);

  const visible = showAll ? filtered : filtered.slice(0, 12);

  // Summary stats
  const highAlert = filtered.filter((d) => d.swingScore >= 15).length;
  const medAlert = filtered.filter((d) => d.swingScore >= 8 && d.swingScore < 15).length;
  const mostSplit = filtered.find((d) => Math.abs(d.orgOwnerPercent - 50) < 15);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Differential Alerts</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {data
            ? `${data.gameweekName} · players creating unequal exposure within your org`
            : "Players owned by some managers but not others — points swing risk"}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load differential data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="Total differentials"
              value={String(data.differentials.length)}
              sub="partially-owned players"
            />
            <SummaryCard
              label="High-alert"
              value={String(highAlert)}
              sub="swing score ≥ 15"
              danger={highAlert > 0}
            />
            <SummaryCard
              label="Medium alert"
              value={String(medAlert)}
              sub="swing score 8–14"
              warn={medAlert > 0}
            />
            <SummaryCard
              label="Most divisive"
              value={mostSplit?.webName ?? "—"}
              sub={
                mostSplit
                  ? `${mostSplit.ownerCount}/${mostSplit.totalMembers} own · ${mostSplit.team}`
                  : "all aligned"
              }
            />
          </div>

          {/* Explainer */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-3 text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">How swing score works: </span>
            Swing = expected points × split factor. A 4/8 split with a player expected to score 12 pts creates a{" "}
            <span className="font-semibold text-slate-700">12 pt swing</span> between owners and non-owners that gameweek.
            The score peaks when ownership is exactly 50/50.
            <span className="ml-2 inline-flex gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> ≥15 high
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 8–14 medium
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> &lt;8 low
              </span>
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Position filter */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {([0, 1, 2, 3, 4] as PosFilter[]).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
                    posFilter === pos
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {pos === 0 ? "All" : POSITION_LABEL[pos]}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Sort:</span>
              <div className="relative">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="appearance-none border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 bg-white cursor-pointer shadow-sm"
                >
                  <option value="swing">Swing score</option>
                  <option value="form">Form</option>
                  <option value="ep">Exp. points</option>
                  <option value="owned">Most divisive</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Cards */}
          {filtered.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-xl px-5 py-10 text-center text-sm text-slate-400 shadow-card">
              No differentials found for this filter.
            </div>
          ) : (
            <div className="space-y-2.5">
              {visible.map((d) => {
                const isHighAlert = d.swingScore >= 15;
                const isMedAlert = d.swingScore >= 8;
                const borderColour = isHighAlert
                  ? "border-red-200"
                  : isMedAlert
                  ? "border-amber-200"
                  : "border-slate-200/80";
                const alertDot = isHighAlert
                  ? "bg-red-500"
                  : isMedAlert
                  ? "bg-amber-400"
                  : "bg-slate-300";

                return (
                  <div
                    key={d.playerId}
                    className={`bg-white border ${borderColour} rounded-xl px-4 py-4 shadow-card`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Alert dot */}
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${alertDot}`} />

                      {/* Main content */}
                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Top row: player info */}
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POSITION_COLOUR[d.elementType]}`}>
                              {POSITION_LABEL[d.elementType]}
                            </span>
                            <span className="text-base font-black text-slate-900">{d.webName}</span>
                            <span className="text-sm text-slate-400 font-medium">{d.team}</span>
                            <span className="text-xs text-slate-400">£{(d.nowCost / 10).toFixed(1)}m</span>
                            <span className="text-xs text-slate-500">
                              Form: <span className="font-semibold text-slate-700">{d.form.toFixed(1)}</span>
                            </span>
                          </div>

                          {/* Swing score + fixture */}
                          <div className="flex items-center gap-4 shrink-0">
                            {d.nextFixture && (
                              <div className="text-right">
                                <div className="flex items-center gap-1 justify-end mb-0.5">
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${FDR_COLOUR[d.nextFixture.fdr] ?? "bg-slate-200 text-slate-600"}`}
                                  >
                                    {d.nextFixture.fdr}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-600">
                                    {d.nextFixture.isHome ? "" : "@"}{d.nextFixture.opponent}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400">next fixture</div>
                              </div>
                            )}
                            <SwingBadge score={d.swingScore} epNext={d.epNext} />
                          </div>
                        </div>

                        {/* Ownership bar + names */}
                        <OwnershipBar
                          ownerCount={d.ownerCount}
                          totalMembers={d.totalMembers}
                          owners={d.owners}
                          nonOwners={d.nonOwners}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {filtered.length > 12 && (
                <button
                  onClick={() => setShowAll((s) => !s)}
                  className="w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition-colors shadow-card"
                >
                  {showAll
                    ? "Show fewer"
                    : `Show ${filtered.length - 12} more differentials`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  danger,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
  warn?: boolean;
}) {
  const bg = danger
    ? "bg-red-50 border-red-200"
    : warn
    ? "bg-amber-50 border-amber-200"
    : "bg-white border-slate-200/80";
  const valueColour = danger
    ? "text-red-600"
    : warn
    ? "text-amber-700"
    : "text-slate-900";

  return (
    <div className={`rounded-xl px-4 py-3.5 border ${bg} shadow-card`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-black truncate ${valueColour}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
