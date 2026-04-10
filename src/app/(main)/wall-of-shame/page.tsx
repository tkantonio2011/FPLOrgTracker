"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ShameRecord, WallOfShameResponse } from "@/app/api/wall-of-shame/route";

// ── Trophy Card ───────────────────────────────────────────────────────────────

function TrophyCard({ record }: { record: ShameRecord }) {
  return (
    <div className="relative flex flex-col bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card group hover:shadow-md transition-shadow duration-200">
      {/* Dark header strip */}
      <div className="bg-slate-900 px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="text-4xl leading-none" role="img" aria-label={record.trophy}>
            {record.icon}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-1 text-right">
            {record.winner.teamName || "Unknown FC"}
          </span>
        </div>
        <h2 className="text-base font-black text-white leading-tight">{record.trophy}</h2>
        <p className="text-xs text-slate-400 mt-1 leading-snug">{record.subtitle}</p>
      </div>

      {/* Winner section */}
      <div className="px-5 py-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
            Awarded to
          </p>
          <Link
            href={`/members/${record.winner.managerId}`}
            className="text-xl font-black text-red-600 hover:text-red-700 transition-colors leading-tight block"
          >
            {record.winner.displayName}
          </Link>
        </div>

        {/* Stat */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-3xl font-black text-slate-900 tabular-nums leading-none">
            {record.stat}
          </p>
          <p className="text-xs text-slate-400 mt-1.5 leading-snug">{record.detail}</p>
        </div>
      </div>

      {/* Shame ribbon */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <span className="text-[8px] font-black uppercase tracking-widest bg-red-600 text-white px-1.5 py-0.5 rounded-full">
          Shame
        </span>
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card animate-pulse">
      <div className="bg-slate-200 h-[120px]" />
      <div className="px-5 py-4 space-y-3">
        <div className="h-3 bg-slate-100 rounded w-1/3" />
        <div className="h-5 bg-slate-200 rounded w-2/3" />
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="h-8 bg-slate-100 rounded w-1/2" />
          <div className="h-3 bg-slate-100 rounded w-full" />
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WallOfShamePage() {
  const { data, isLoading, isError } = useQuery<WallOfShameResponse>({
    queryKey: ["wall-of-shame"],
    queryFn: async () => {
      const r = await fetch("/api/wall-of-shame");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Wall of Shame</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          A permanent record of the season&apos;s most spectacular failures. Updated weekly.
        </p>
      </div>

      {/* Banner */}
      <div className="bg-slate-900 rounded-2xl px-6 py-5 flex items-center gap-4">
        <span className="text-4xl" role="img" aria-label="trophy">🏆</span>
        <div>
          <p className="text-white font-bold text-sm">GW{data?.currentGw ?? "—"} Season Records</p>
          <p className="text-slate-400 text-xs mt-0.5">
            Each trophy is awarded to the manager who has achieved the most impressive form of suffering.
            The winners are updated after every gameweek.
          </p>
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load the Wall of Shame. The FPL API may be temporarily unavailable.
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {/* Trophy grid */}
      {data && data.records.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.records.map((record) => (
            <TrophyCard key={record.id} record={record} />
          ))}
        </div>
      )}

      {data && data.records.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">😇</p>
          <p className="font-semibold text-slate-600">No shame yet</p>
          <p className="text-sm mt-1">Check back after the first gameweek.</p>
        </div>
      )}

      {/* Footer note */}
      {data && data.records.length > 0 && (
        <p className="text-xs text-slate-400 text-center pb-2">
          Records reflect cumulative season stats up to GW{data.currentGw}.
          Trophies are permanent — there is no escaping the Wall.
        </p>
      )}
    </div>
  );
}
