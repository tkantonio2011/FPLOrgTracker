"use client";

import { useQuery } from "@tanstack/react-query";

interface PainStats {
  currentGw: number;
  managersCount: number;
  benchPtsTotal: number;
  hitCostTotal: number;
  sufferingTotal: number;
  belowAvgGws: number;
  worstBenchGw: { managerName: string; pts: number; gw: number } | null;
  biggestHit:   { managerName: string; cost: number; gw: number } | null;
  painfulGw:    { gw: number; totalSuffering: number } | null;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function PainTile({
  emoji,
  value,
  label,
  footnote,
}: {
  emoji: string;
  value: string;
  label: string;
  footnote?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3.5 sm:border-r border-white/10 last:border-r-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xl leading-none">{emoji}</span>
        <span className="text-xl sm:text-2xl font-black tabular-nums text-white leading-none">
          {value}
        </span>
      </div>
      <p className="text-xs font-semibold text-white/70 leading-snug">{label}</p>
      {footnote && (
        <p className="text-[10px] text-white/35 leading-snug">{footnote}</p>
      )}
    </div>
  );
}

// ── Skeleton tiles ────────────────────────────────────────────────────────────

function SkeletonTile() {
  return (
    <div className="px-4 py-3.5 space-y-2 sm:border-r border-white/10 last:border-r-0">
      <div className="h-7 w-20 bg-white/10 rounded animate-pulse" />
      <div className="h-3 w-28 bg-white/10 rounded animate-pulse" />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PainCounter() {
  const { data, isLoading, isError } = useQuery<PainStats>({
    queryKey: ["pain-stats"],
    queryFn: async () => {
      const r = await fetch("/api/pain-stats");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
    retry: false,
  });

  // Silently absent if org not configured
  if (isError) return null;

  // Human-readable hit cost: each hit = 4 pts
  const hitPts    = data?.hitCostTotal ?? 0;
  const hitCount  = Math.round(hitPts / 4);

  // "£Xm equivalent" framing — a cheeky fictional valuation
  // 4 pts ≈ 1 FPL hit ≈ roughly £4.5m player's points in one GW. We just call it dramatic.
  const hitMoney = hitPts >= 40
    ? `${(hitPts / 4).toFixed(0)} hits taken`
    : hitCount > 0
    ? `${hitCount} hit${hitCount !== 1 ? "s" : ""} taken`
    : "zero hits (suspicious)";

  const tiles = data
    ? [
        {
          emoji: "🪑",
          value: `${data.benchPtsTotal} pts`,
          label: "left rotting on the bench this season",
          footnote: data.worstBenchGw
            ? `Worst offender: ${data.worstBenchGw.managerName.split(" ")[0]} — ${data.worstBenchGw.pts} pts on bench in GW${data.worstBenchGw.gw}`
            : undefined,
        },
        {
          emoji: "💸",
          value: `${data.hitCostTotal} pts`,
          label: "flushed away on transfer hits",
          footnote: hitMoney,
        },
        {
          emoji: "😤",
          value: `${data.sufferingTotal} pts`,
          label: "suffered below the weekly winner",
          footnote: data.painfulGw
            ? `Darkest week: GW${data.painfulGw.gw} (${data.painfulGw.totalSuffering} pts of collective pain)`
            : undefined,
        },
        {
          emoji: "📉",
          value: String(data.belowAvgGws),
          label: "below-average GWs across the org",
          footnote: `across ${data.managersCount} managers · GW1–GW${data.currentGw}`,
        },
      ]
    : null;

  return (
    <div
      className="rounded-xl overflow-hidden shadow-card border border-white/5"
      style={{ background: "linear-gradient(135deg, #1e0533 0%, #37003c 60%, #1a0528 100%)" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2.5">
        <span className="text-base">🩹</span>
        <div>
          <p className="text-xs font-bold text-[#00ff87] uppercase tracking-widest">
            Season of Pain
          </p>
          <p className="text-[11px] text-white/40 font-medium">
            {data
              ? `GW1–GW${data.currentGw} · ${data.managersCount} managers · cumulative suffering`
              : "Loading org-wide damage report…"}
          </p>
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-white/10">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonTile key={i} />)
          : tiles?.map((t) => <PainTile key={t.label} {...t} />)}
      </div>
    </div>
  );
}
