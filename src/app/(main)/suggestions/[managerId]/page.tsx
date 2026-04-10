"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TransferCard } from "@/components/suggestions/TransferCard";
import { CaptainCard } from "@/components/suggestions/CaptainCard";
import { ChipAdvisorPanel } from "@/components/suggestions/ChipAdvisorPanel";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { ApiErrorBanner } from "@/components/ui/ErrorBoundary";

interface TransferData {
  managerId: number;
  gameweekId: number;
  freeTransfers: number;
  bank: number;
  suggestions: {
    rank: number;
    playerOut: { id: number; webName: string; nowCost: number; status: string; news: string; form: string; avgFdr: number };
    playerIn: { id: number; webName: string; nowCost: number; form: string; upcomingFdr: number; teamShortName: string; status: string };
    isFreeTransfer: boolean;
    reasoning: string;
    score: number;
  }[];
  error?: string;
  code?: string;
}

interface CaptainData {
  managerId: number;
  gameweekId: number;
  suggestions: {
    rank: number;
    player: { id: number; webName: string; teamShortName: string; form: string; status: string; news: string; elementType: number };
    fixture: { opponent: string; isHome: boolean; difficulty: number; isDgw: boolean };
    isDifferential: boolean;
    orgOwnershipPercent: number;
    reasoning: string;
    score: number;
  }[];
  error?: string;
  code?: string;
}

interface ChipData {
  managerId: number;
  chips: {
    benchBoost: { available: boolean; usedInGameweek?: number; recommendedGameweek: number | null; reasoning: string; expectedUplift?: number };
    tripleCaptain: { available: boolean; usedInGameweek?: number; recommendedGameweek: number | null; reasoning: string; expectedUplift?: number };
    wildcard: { available: boolean; usedInGameweek?: number; recommendedGameweek: number | null; reasoning: string };
    freeHit: { available: boolean; usedInGameweek?: number; recommendedGameweek: number | null; reasoning: string };
  };
  orgChipUsage: { managerId: number; displayName: string; benchBoostUsed: boolean; tripleCaptainUsed: boolean; wildcardUsed: boolean; freeHitUsed: boolean }[];
  error?: string;
  code?: string;
}

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);

export default function SuggestionsPage({ params }: { params: { managerId: string } }) {
  const { managerId } = params;
  const [diffOnly, setDiffOnly] = useState(false);

  const transfersQuery = useQuery<TransferData>({
    queryKey: ["suggestions/transfers", managerId],
    queryFn: () => fetch(`/api/suggestions/transfers?managerId=${managerId}`).then((r) => r.json()),
    staleTime: 300_000,
  });

  const captainQuery = useQuery<CaptainData>({
    queryKey: ["suggestions/captain", managerId],
    queryFn: () => fetch(`/api/suggestions/captain?managerId=${managerId}`).then((r) => r.json()),
    staleTime: 300_000,
  });

  const chipsQuery = useQuery<ChipData>({
    queryKey: ["suggestions/chips", managerId],
    queryFn: () => fetch(`/api/suggestions/chips?managerId=${managerId}`).then((r) => r.json()),
    staleTime: 3_600_000,
  });

  const captainSuggestions = diffOnly
    ? (captainQuery.data?.suggestions ?? []).filter((s) => s.isDifferential)
    : (captainQuery.data?.suggestions ?? []);

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/standings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors"
        >
          <BackIcon />
          Standings
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Suggestions</h1>
        <p className="text-sm text-slate-400">
          GW{transfersQuery.data?.gameweekId ?? "…"} recommendations for Manager {managerId}
        </p>
      </div>

      {/* ── Transfers ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-800">Transfer Suggestions</h2>
          {transfersQuery.data && !transfersQuery.data.error && (
            <span className="text-xs text-slate-400 tabular">
              {transfersQuery.data.freeTransfers} free transfer{transfersQuery.data.freeTransfers !== 1 ? "s" : ""}
              {" · "}bank £{((transfersQuery.data.bank ?? 0) / 10).toFixed(1)}m
            </span>
          )}
        </div>

        {transfersQuery.isLoading && (
          <div className="space-y-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} rows={2} />)}</div>
        )}
        {transfersQuery.data?.code && <ApiErrorBanner code={transfersQuery.data.code} />}
        {transfersQuery.data?.suggestions && (
          <div className="space-y-3">
            {transfersQuery.data.suggestions.map((s) => (
              <TransferCard key={s.rank} suggestion={s} />
            ))}
            {transfersQuery.data.suggestions.length === 0 && (
              <p className="text-sm text-slate-400 italic">No transfer suggestions available.</p>
            )}
          </div>
        )}
      </section>

      {/* ── Captain ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-800">Captain Picks</h2>
          <button
            onClick={() => setDiffOnly((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-150 cursor-pointer ${
              diffOnly
                ? "bg-[#37003c] text-white border-[#37003c] shadow-sm"
                : "text-slate-500 border-slate-200 hover:border-[#37003c]/50 hover:text-[#37003c]"
            }`}
          >
            {diffOnly ? "All picks" : "Differentials only"}
          </button>
        </div>

        {captainQuery.isLoading && (
          <div className="space-y-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} rows={3} />)}</div>
        )}
        {captainQuery.data?.code && <ApiErrorBanner code={captainQuery.data.code} />}
        {captainSuggestions.length > 0 && (
          <div className="space-y-3">
            {captainSuggestions.map((s) => (
              <CaptainCard key={s.rank} suggestion={s} />
            ))}
          </div>
        )}
        {captainQuery.data && captainSuggestions.length === 0 && !captainQuery.data.code && (
          <p className="text-sm text-slate-400 italic">
            {diffOnly ? "No differential captain options found." : "No captain suggestions available."}
          </p>
        )}
      </section>

      {/* ── Chip Advisor ──────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold text-slate-800 mb-3">Chip Advisor</h2>
        {chipsQuery.isLoading && <SkeletonCard rows={4} />}
        {chipsQuery.data?.code && <ApiErrorBanner code={chipsQuery.data.code} />}
        {chipsQuery.data && !chipsQuery.data.code && (
          <ChipAdvisorPanel data={chipsQuery.data} />
        )}
      </section>
    </div>
  );
}
