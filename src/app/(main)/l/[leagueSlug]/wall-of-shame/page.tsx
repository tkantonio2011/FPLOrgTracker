"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLeague } from "@/components/league/LeagueProvider";

import { HelpButton } from "@/components/manual/HelpButton";
interface ShameRecord {
  id: string;
  trophy: string;
  subtitle: string;
  icon: string;
  winner: {
    managerId: number;
    displayName: string;
    teamName: string;
  };
  stat: string;
  detail: string;
}

interface WallOfShameResponse {
  records: ShameRecord[];
  currentGw: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function TrophyCard({ record, leagueSlug }: { record: ShameRecord; leagueSlug: string }) {
  return (
    <div className="relative flex flex-col bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card group hover:shadow-md transition-shadow duration-200">
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

      <div className="px-5 py-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
            Awarded to
          </p>
          <Link
            href={`/l/${leagueSlug}/members/${record.winner.managerId}`}
            className="text-xl font-black text-red-600 hover:text-red-700 transition-colors leading-tight block"
          >
            {record.winner.displayName}
          </Link>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-3xl font-black text-slate-900 tabular-nums leading-none">
            {record.stat}
          </p>
          <p className="text-xs text-slate-400 mt-1.5 leading-snug">{record.detail}</p>
        </div>
      </div>

      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <span className="text-[8px] font-black uppercase tracking-widest bg-red-600 text-white px-1.5 py-0.5 rounded-full">
          Shame
        </span>
      </div>
    </div>
  );
}

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

export default function WallOfShamePage() {
  const { league } = useLeague();
  const { data, isLoading, isError } = useQuery<WallOfShameResponse>({
    queryKey: ["wall-of-shame", league.id],
    queryFn: async () => {
      const r = await fetch(`/api/leagues/${league.id}/wall-of-shame`);
      const body = (await r.json()) as ApiEnvelope<WallOfShameResponse>;
      if (!r.ok || !body.success || !body.data) throw new Error(body.error ?? "Wall of shame failed");
      return body.data;
    },
    staleTime: 300_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Wall of Shame</h1>
        <HelpButton topic="/help/reading-the-app/wall-of-shame" />
        <p className="text-sm text-slate-400 mt-0.5">
          A permanent record of the season&apos;s most spectacular failures. Updated weekly.
        </p>
      </div>

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

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load the Wall of Shame. The FPL API may be temporarily unavailable.
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {data && data.records.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.records.map((record) => (
            <TrophyCard key={record.id} record={record} leagueSlug={league.slug} />
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

      {data && data.records.length > 0 && (
        <p className="text-xs text-slate-400 text-center pb-2">
          Records reflect cumulative season stats up to GW{data.currentGw}.
          Trophies are permanent — there is no escaping the Wall.
        </p>
      )}
    </div>
  );
}
