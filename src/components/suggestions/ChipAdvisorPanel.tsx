"use client";

import { Badge, chipLabel } from "@/components/ui/Badge";

interface ChipRec {
  available: boolean;
  usedInGameweek?: number;
  recommendedGameweek: number | null;
  reasoning: string;
  expectedUplift?: number;
}

interface OrgChipUsage {
  managerId: number;
  displayName: string;
  benchBoostUsed: boolean;
  tripleCaptainUsed: boolean;
  wildcardUsed: boolean;
  freeHitUsed: boolean;
}

interface ChipAdvisorData {
  chips: {
    benchBoost: ChipRec;
    tripleCaptain: ChipRec;
    wildcard: ChipRec;
    freeHit: ChipRec;
  };
  orgChipUsage: OrgChipUsage[];
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

const DashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
    <path d="M5 12h14"/>
  </svg>
);

function ChipCard({ name, rec }: { name: string; rec: ChipRec }) {
  return (
    <div className={`bg-white border rounded-xl p-4 space-y-2.5 shadow-card ${
      rec.available ? "border-slate-200/80" : "border-slate-100 opacity-60"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-slate-800 text-sm">{name}</span>
        {rec.available ? (
          <Badge variant="success">Available</Badge>
        ) : (
          <Badge variant="default">Used GW{rec.usedInGameweek}</Badge>
        )}
      </div>

      {rec.available && rec.recommendedGameweek && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Recommended:</span>
          <span className="text-sm font-bold text-[#37003c] tabular">GW{rec.recommendedGameweek}</span>
          {rec.expectedUplift !== undefined && (
            <span className="text-xs font-medium text-emerald-600 tabular">+{rec.expectedUplift} pts</span>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400 italic leading-relaxed">{rec.reasoning}</p>
    </div>
  );
}

export function ChipAdvisorPanel({ data }: { data: ChipAdvisorData }) {
  const chips = [
    { key: "benchBoost", name: "Bench Boost", rec: data.chips.benchBoost },
    { key: "tripleCaptain", name: "Triple Captain", rec: data.chips.tripleCaptain },
    { key: "wildcard", name: "Wildcard", rec: data.chips.wildcard },
    { key: "freeHit", name: "Free Hit", rec: data.chips.freeHit },
  ];

  return (
    <div className="space-y-4">
      {/* Chip recommendation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {chips.map((c) => (
          <ChipCard key={c.key} name={c.name} rec={c.rec} />
        ))}
      </div>

      {/* Org chip usage table */}
      {data.orgChipUsage.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Organisation Chip Usage</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-50 text-xs">
              <thead className="bg-slate-50/40">
                <tr>
                  <th className="px-4 py-2.5 text-left text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Member</th>
                  <th className="px-3 py-2.5 text-center text-slate-400 font-semibold uppercase tracking-wider text-[10px]">BB</th>
                  <th className="px-3 py-2.5 text-center text-slate-400 font-semibold uppercase tracking-wider text-[10px]">TC</th>
                  <th className="px-3 py-2.5 text-center text-slate-400 font-semibold uppercase tracking-wider text-[10px]">WC</th>
                  <th className="px-3 py-2.5 text-center text-slate-400 font-semibold uppercase tracking-wider text-[10px]">FH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.orgChipUsage.map((m) => (
                  <tr key={m.managerId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{m.displayName}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="flex justify-center">{m.benchBoostUsed ? <CheckIcon /> : <DashIcon />}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="flex justify-center">{m.tripleCaptainUsed ? <CheckIcon /> : <DashIcon />}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="flex justify-center">{m.wildcardUsed ? <CheckIcon /> : <DashIcon />}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="flex justify-center">{m.freeHitUsed ? <CheckIcon /> : <DashIcon />}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
