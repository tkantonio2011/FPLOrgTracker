"use client";

import { useQuery } from "@tanstack/react-query";

interface Gameweek {
  id: number;
  name: string;
  isFinished: boolean;
  isCurrent: boolean;
  isNext: boolean;
}

interface GwSelectorProps {
  selectedGw: number;
  onChange: (gw: number) => void;
}

export function GwSelector({ selectedGw, onChange }: GwSelectorProps) {
  const { data } = useQuery<{ currentGameweek: number; gameweeks: Gameweek[] }>({
    queryKey: ["gameweeks"],
    queryFn: () => fetch("/api/gameweeks").then((r) => r.json()),
    staleTime: 300_000,
  });

  const available = data?.gameweeks.filter((gw) => gw.isFinished || gw.isCurrent) ?? [];

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-slate-500">Gameweek</label>
      <div className="relative">
        <select
          value={selectedGw}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="appearance-none border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c]/50 bg-white cursor-pointer shadow-sm transition-colors hover:border-slate-300 tabular"
        >
          {available.map((gw) => (
            <option key={gw.id} value={gw.id}>
              {gw.name}{gw.isCurrent ? " ★" : ""}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
