"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { LeaguePositionChart } from "./LeaguePositionChart";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { WeeklyHighlights } from "./WeeklyHighlights";
import { GwTribunal } from "./GwTribunal";
import { GwPunishment } from "./GwPunishment";
import { PainCounter } from "./PainCounter";
import { GwHoroscope } from "./GwHoroscope";

const QUOTES = [
  "FPL: the only game where a knee injury to a stranger ruins your weekend.",
  "Differential pick. Triple-digit ownership. Name a more iconic duo.",
  "Nothing unites a family like blaming your captain pick at Sunday dinner.",
  "My team is like fine wine — it gets worse with every gameweek.",
  "Auto-substitution came through? That's not tactics, that's desperation.",
  "The moment you press 'confirm transfers' is the moment regret begins.",
  "Blank gameweek hits different when you have no bench.",
  "Wildcarded in GW4. Peak FPL experience.",
  "Trust the process. The process is chaos.",
  "Son blanks every week I captain him. Coincidence? Absolutely not.",
  "Three red arrows and a live rank of 3.2 million. This is fine.",
  "Hit a -8 transfer. Scored 2 points. Totally worth it.",
  "Price rises at 2am. My social life, also at 2am.",
  "Every manager is a genius until their first blank gameweek.",
  "Haaland: 47 points last week. Me: I didn't have him.",
  "The best chip is always the one you haven't used yet.",
  "'Set and forget' they said. 'It'll be fine' they said.",
  "My team sheet looks better on paper. Significantly better.",
  "Transferred out Salah one hour before his hat-trick. Classic.",
  "FPL is just spreadsheets with feelings.",
  "A premium defender scoring more than your entire attack. Checks out.",
  "Ownership 0.3%. Score 0. Because of course.",
  "Free hit after a blank gameweek: peak optimism, minimum reward.",
  "I don't have a problem. I just refresh the injury news every 20 minutes.",
  "The real FPL prize is the friends we lost along the way.",
];

// ── GW Performance commentary ────────────────────────────────────────────────

interface PerformanceEntry {
  rank: number;
  rankChange: number;
  displayName: string;
  teamName: string;
  gameweekPoints: number;
  chipUsed: string | null;
}

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
};

function gwVerdict(
  entry: PerformanceEntry,
  rank: number,
  total: number,
  orgAvg: number,
  globalAvg: number
): string {
  const pts = entry.gameweekPoints;
  const vsOrg = pts - orgAvg;
  const vsGlobal = pts - globalAvg;
  const chip = entry.chipUsed ? CHIP_LABELS[entry.chipUsed] ?? entry.chipUsed : null;
  const isFirst = rank === 1;
  const isLast = rank === total;
  const climbedBy = entry.rankChange;
  const droppedBy = -entry.rankChange;

  // Extract first name for personalisation
  const firstName = entry.displayName.split(" ")[0];
  const team = entry.teamName;

  // ── Chip verdicts ────────────────────────────────────────────────────────────
  if (chip === "Wildcard") {
    if (vsOrg >= 10)
      return `${firstName} blew up the squad, rebuilt from scratch, and came out ${vsOrg} pts above the org average. Full platform migration, zero downtime. Compliance is impressed.`;
    if (vsOrg >= 0)
      return `Wildcard played by ${firstName} — a complete system overhaul that landed just above the org average. Marginal gains, stable uptime. Sprint review was fine, honestly.`;
    return `${firstName} wildcarded "${team}" and still finished ${Math.abs(vsOrg)} pts below the org average. Even a full platform rewrite couldn't save this deployment. IT helpdesk is concerned.`;
  }
  if (chip === "Bench Boost") {
    if (vsOrg >= 10)
      return `${firstName}'s bench delivered like a peak-hour gas pipeline — every unit accounted for, ${pts} pts total, maximum throughput. The reserves earned their keep this week.`;
    if (vsOrg >= 0)
      return `Bench Boost played by ${firstName}. The reserves clocked in, did their jobs, went home. Capacity utilisation: adequate. The ${team} subs were quietly professional.`;
    return `${firstName} activated the Bench Boost and the bench scored as if it were a Friday afternoon before a bank holiday. A cautionary tale about redundant systems at "${team}".`;
  }
  if (chip === "Triple Captain") {
    if (vsOrg >= 15)
      return `${firstName}'s Triple Captain landed perfectly — ${pts} pts, ${vsOrg} above the org average. Like hedging an energy contract at the exact peak. Pure alpha. Screenshot saved.`;
    if (vsOrg >= 0)
      return `${firstName} tripled the captain and scraped above average. The upside was modest — like pricing a long-term gas deal on a calm Tuesday in February. Expected more, got adequate.`;
    return `${firstName} Triple Captained someone who blanked, bringing "${team}" to just ${pts} pts. The sort of position sizing decision that gets people cc'd on a very uncomfortable email chain.`;
  }
  if (chip === "Free Hit") {
    if (vsOrg >= 10)
      return `${firstName}'s Free Hit was a masterclass in emergency response — squad overhauled, ${pts} pts banked, ${vsOrg} above the org average. The post-mortem will be a case study.`;
    if (vsOrg >= 0)
      return `Free Hit deployed by ${firstName} — a complete squad teardown and rebuild that landed just above average. Neutral energy. Flat P&L. "${team}" remains standing, just about.`;
    return `${firstName} used the Free Hit, replaced every player in "${team}", and still ended up ${Math.abs(vsOrg)} pts below the org average. This is what a rollback that also breaks prod looks like.`;
  }

  // ── First place ──────────────────────────────────────────────────────────────
  if (isFirst && vsGlobal >= 20)
    return `${firstName} cooked this gameweek — ${pts} pts, ${vsGlobal} above the global average, top of the org. EnergyOne's board would like a word with "${team}". About FPL. Not Q2.`;
  if (isFirst && vsGlobal >= 10)
    return `GW winner. ${firstName} put up ${pts} pts and beat the global FPL average by ${vsGlobal}. Strong long position on premium assets. Risk-adjusted returns: exceptional. Annual leave: pending.`;
  if (isFirst && climbedBy > 0)
    return `${firstName} climbed ${climbedBy} place${climbedBy > 1 ? "s" : ""} to lead the org with ${pts} pts. Not flashy — just consistent. "${team}" is a baseload power plant. Unglamorous. Effective.`;
  if (isFirst)
    return `${firstName} tops the org this week on ${pts} pts. Steady, reliable, unspectacular — the kind of performance that keeps the lights on at EnergyOne without anyone noticing.`;

  // ── Last place ───────────────────────────────────────────────────────────────
  if (isLast && vsGlobal <= -20)
    return `${firstName}'s "${team}" scored ${pts} pts — ${Math.abs(vsGlobal)} below the global average. This is a force majeure event. Contractual obligations to the league table have not been met.`;
  if (isLast && vsOrg <= -15)
    return `Dead last. ${firstName} delivered ${pts} pts from "${team}", ${Math.abs(vsOrg)} below the org average. Jira ticket raised: "FPL-${pts}: critical regression in squad output. Priority: High."`;
  if (isLast && droppedBy > 0)
    return `${firstName} drops ${droppedBy} place${droppedBy > 1 ? "s" : ""} to finish bottom of the org on ${pts} pts. Gas prices do what they want. Anyone can model it. Sometimes the market just says no.`;
  if (isLast)
    return `${firstName} finishes last this week with ${pts} pts. "${team}" submitted its output and the output was not good. The quarterly review will require some narrative repositioning.`;

  // ── Strong positive ──────────────────────────────────────────────────────────
  if (vsGlobal >= 20)
    return `${pts} pts and ${vsGlobal} above the global FPL average. ${firstName}'s "${team}" executed a textbook peak-price trade — the kind of move that gets referenced in standups for weeks.`;
  if (vsOrg >= 15 && climbedBy > 0)
    return `${firstName} surged ${climbedBy} place${climbedBy > 1 ? "s" : ""} up the table, ${vsOrg} pts above the org average. "${team}" is running hot. Management has been notified.`;
  if (vsOrg >= 15)
    return `${firstName} crushed the org average by ${vsOrg} pts with "${team}" on ${pts}. Either the team selection was inspired or the others were distracted by an energy market spike. Probably both.`;
  if (vsOrg >= 8 && vsGlobal >= 5 && climbedBy > 0)
    return `${firstName} climbed ${climbedBy} place${climbedBy > 1 ? "s" : ""} this week — ${pts} pts, above both org and global average. "${team}" is firing on all cylinders. Clean output, no volatility.`;
  if (vsOrg >= 8 && vsGlobal >= 5)
    return `Solid green week for ${firstName} — ${pts} pts, above org and global average. "${team}" operated like a well-maintained pipeline: no drama, consistent throughput, exactly as specced.`;

  // ── Moderate positive ────────────────────────────────────────────────────────
  if (vsOrg >= 5 && climbedBy > 0)
    return `${firstName} beat the org average by ${vsOrg} pts and climbed ${climbedBy} place${climbedBy > 1 ? "s" : ""}. Not a spectacular trade, but "${team}" is trending in the right direction. P&L: positive.`;
  if (vsOrg >= 5)
    return `${firstName}'s "${team}" finished ${vsOrg} pts above the org average on ${pts}. A profitable week — not a headline trade, but stakeholders are adequately managed and no one is filing a complaint.`;

  // ── Around average ───────────────────────────────────────────────────────────
  if (Math.abs(vsOrg) <= 2 && Math.abs(vsGlobal) <= 2)
    return `${firstName} landed exactly on both the org and global average with ${pts} pts. "${team}" achieved maximum efficiency and minimum excitement. A textbook enterprise software deployment.`;
  if (Math.abs(vsOrg) <= 3 && vsGlobal > 0)
    return `${firstName}'s "${team}" scored ${pts} — right on the org average, slightly above global. Neutral energy, no surprises. The kind of week that neither wins awards nor triggers incident reports.`;
  if (Math.abs(vsOrg) <= 3)
    return `${pts} pts for ${firstName} — hovering around the org average. "${team}" is the equivalent of a flat spot in the energy curve: present, accounted for, and generating no headlines.`;

  // ── Marginally above ────────────────────────────────────────────────────────
  if (vsOrg > 0 && vsOrg < 5 && climbedBy > 0)
    return `${firstName} nudged ${vsOrg} pts above the org average and moved up ${climbedBy} place${climbedBy > 1 ? "s" : ""}. Like a 1% efficiency gain on a gas turbine — technically positive, not worth the press release, but logged.`;
  if (vsOrg > 0 && vsOrg < 5)
    return `${firstName}'s "${team}" scraped ${vsOrg} pts above the org average on ${pts}. Marginal upside. The spread is thin but it's still green. EnergyOne's risk desk files this under "acceptable".`;

  // ── Slightly below ───────────────────────────────────────────────────────────
  if (vsOrg >= -5 && droppedBy > 2)
    return `${firstName} drops ${droppedBy} places and finishes ${Math.abs(vsOrg)} pts below the org average with ${pts}. A minor negative spread on "${team}". The risk model predicted this. Nobody read the risk model.`;
  if (vsOrg >= -5 && droppedBy > 0)
    return `${firstName} slips ${droppedBy} place${droppedBy > 1 ? "s" : ""} to ${rank} with ${pts} pts — just below the org average. A small drawdown on "${team}". Not a crisis, but it'll show up in the monthly report.`;
  if (vsOrg >= -5)
    return `${firstName}'s "${team}" finished ${Math.abs(vsOrg)} pts below the org average on ${pts}. A minor negative spread. The logic was sound. The execution was also sound. The market simply disagreed.`;

  // ── Notably below ───────────────────────────────────────────────────────────
  if (vsOrg >= -10 && droppedBy > 2)
    return `${firstName} fell ${droppedBy} places with just ${pts} pts from "${team}" — ${Math.abs(vsOrg)} below the org average. A poorly-timed hedge. The position was opened with conviction and closed with regret.`;
  if (vsOrg >= -10)
    return `${firstName}'s "${team}" is ${Math.abs(vsOrg)} pts below the org average this week on ${pts}. The energy equivalent of buying gas at peak price and selling at baseload. The trade thesis needs revisiting.`;

  // ── Significant drop ─────────────────────────────────────────────────────────
  if (droppedBy > 2)
    return `${firstName} loses ${droppedBy} places this week, "${team}" delivering just ${pts} pts — ${Math.abs(vsOrg)} below the org average. A sharp drawdown. Stop-loss not triggered. It should have been.`;
  return `${firstName}'s "${team}" posted ${pts} pts — ${Math.abs(vsOrg)} below the org average. The quarterly forecast will need adjusting. EnergyOne's FPL desk formally requests a root-cause analysis by Monday.`;
}

// ── Data types ────────────────────────────────────────────────────────────────

interface StandingsData {
  gameweekId: number;
  standings: {
    rank: number;
    rankChange: number;
    managerId: number;
    displayName: string;
    teamName: string;
    gameweekPoints: number;
    totalPoints: number;
    chipUsed: string | null;
    pointsBehindLeader: number;
  }[];
  orgAverageGwPoints: number;
  globalAverageGwPoints: number;
}

interface GameweeksData {
  currentGameweek: number;
}

interface OrgData {
  name: string;
  miniLeagueId: number | null;
  members: { id: number; displayName: string }[];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="w-7 h-7 rounded-full bg-amber-400 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>;
  if (rank === 2) return <span className="w-7 h-7 rounded-full bg-slate-300 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>;
  if (rank === 3) return <span className="w-7 h-7 rounded-full bg-amber-600/70 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>;
  return <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center shrink-0">{rank}</span>;
}

function RankArrow({ change }: { change: number }) {
  if (change > 0) return <span className="text-emerald-500 text-xs font-bold">▲{change}</span>;
  if (change < 0) return <span className="text-red-400 text-xs font-bold">▼{Math.abs(change)}</span>;
  return <span className="text-slate-300 text-xs">—</span>;
}

interface MeData {
  managerId: number;
  displayName: string;
  teamName: string;
}

function greeting(displayName: string): string {
  const firstName = displayName.split(" ")[0];
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 18) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

export function LandingPage() {
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [reportOpen, setReportOpen] = useState(false);
  const [aiVerdicts, setAiVerdicts] = useState<Record<number, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const generatedForGw = useRef<number | null>(null);

  const { data: meData } = useQuery<MeData>({
    queryKey: ["me"],
    queryFn: () => fetch("/api/auth/me").then((r) => r.ok ? r.json() : null),
    staleTime: Infinity,
    retry: false,
  });

  const { data: myGwStats } = useQuery<{
    gameweekId: number;
    gwScore: number;
    totalPoints: number;
    benchPts: number;
    captainName: string | null;
    captainPts: number;
    chipUsed: string | null;
  }>({
    queryKey: ["me-gw-stats"],
    queryFn: () => fetch("/api/me/gw-stats").then((r) => r.ok ? r.json() : null),
    enabled: !!meData,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const { data: gwData } = useQuery<GameweeksData>({
    queryKey: ["gameweeks"],
    queryFn: () => fetch("/api/gameweeks").then((r) => r.json()),
    staleTime: 300_000,
  });

  const { data: orgData } = useQuery<OrgData, { code?: string }>({
    queryKey: ["org"],
    queryFn: () =>
      fetch("/api/org").then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw json;
        return json;
      }),
    staleTime: 300_000,
    retry: false,
  });

  const currentGw = gwData?.currentGameweek;

  const { data: standingsData, isLoading: standingsLoading } = useQuery<StandingsData, { code?: string }>({
    queryKey: ["standings", currentGw],
    queryFn: () =>
      fetch(`/api/standings${currentGw ? `?gw=${currentGw}` : ""}`).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw json;
        return json;
      }),
    enabled: currentGw !== undefined,
    staleTime: 60_000,
    retry: false,
  });

  const nextQuote = () =>
    setQuoteIdx((i) => {
      let next = i;
      while (next === i) next = Math.floor(Math.random() * QUOTES.length);
      return next;
    });

  const top5 = standingsData?.standings.slice(0, 5) ?? [];
  const leader = standingsData?.standings[0];
  const myStanding = meData
    ? standingsData?.standings.find((s) => s.managerId === meData.managerId)
    : undefined;

  // Sort by GW points descending for the performance report
  const gwRanked = standingsData
    ? [...standingsData.standings].sort((a, b) => b.gameweekPoints - a.gameweekPoints)
    : [];

  // Load cached verdicts from localStorage when GW data arrives; auto-generate if none cached
  useEffect(() => {
    const gwId = standingsData?.gameweekId;
    if (!gwId || generatedForGw.current === gwId) return;
    generatedForGw.current = gwId;

    try {
      const stored = localStorage.getItem(`gw-verdicts-${gwId}`);
      if (stored) {
        setAiVerdicts(JSON.parse(stored) as Record<number, string>);
        return;
      }
    } catch {
      // localStorage unavailable — fall through to generate
    }

    // No cache — auto-generate
    fetchAiVerdicts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsData?.gameweekId]);

  const fetchAiVerdicts = async () => {
    if (!standingsData || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/gw-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameweekId: standingsData.gameweekId,
          orgAverageGwPoints: standingsData.orgAverageGwPoints,
          globalAverageGwPoints: standingsData.globalAverageGwPoints,
          managers: gwRanked.map((e) => ({
            managerId: e.managerId,
            displayName: e.displayName,
            teamName: e.teamName,
            gameweekPoints: e.gameweekPoints,
            rankChange: e.rankChange,
            chipUsed: e.chipUsed,
          })),
        }),
      });
      const data = await res.json() as { verdicts?: { managerId: number; verdict: string }[]; error?: string };
      if (!res.ok || !data.verdicts?.length) {
        setAiError(data.error ?? "No verdicts returned");
        return;
      }
      const map: Record<number, string> = {};
      for (const v of data.verdicts) map[v.managerId] = v.verdict;
      setAiVerdicts(map);
      try {
        // Persist for this GW; clear previous GW entries to avoid stale data
        const gw = standingsData.gameweekId;
        localStorage.setItem(`gw-verdicts-${gw}`, JSON.stringify(map));
        // Remove verdicts from older gameweeks
        for (let i = 1; i < gw; i++) localStorage.removeItem(`gw-verdicts-${i}`);
      } catch {
        // localStorage unavailable
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {meData ? greeting(meData.displayName) : (orgData?.name ?? "Dashboard")}
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {meData
            ? `${meData.teamName}${currentGw ? ` · GW${currentGw}` : ""} · ${orgData?.name ?? ""}`
            : `${currentGw ? `Gameweek ${currentGw} · ` : ""}FPL Organisation Overview`}
        </p>
      </div>

      {/* Personal GW hero card */}
      {meData && (myGwStats || myStanding) && (
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-card overflow-hidden">
          <div className="px-5 py-3 bg-[#37003c] flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#00ff87]">Your Gameweek {myGwStats?.gameweekId ?? currentGw}</span>
            {myGwStats?.chipUsed && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-[#00ff87] text-[#37003c] px-2 py-0.5 rounded-full">
                {CHIP_LABELS[myGwStats.chipUsed] ?? myGwStats.chipUsed}
              </span>
            )}
          </div>
          <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* GW Score */}
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-medium mb-0.5">GW Score</span>
              <span className="text-3xl font-extrabold text-slate-900 leading-none">
                {myGwStats?.gwScore ?? myStanding?.gameweekPoints ?? "—"}
              </span>
              <span className="text-xs text-slate-400 mt-0.5">pts</span>
            </div>

            {/* Org rank */}
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-medium mb-0.5">Org Rank</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-slate-900 leading-none">
                  {myStanding?.rank ?? "—"}
                </span>
                {myStanding && myStanding.rankChange !== 0 && (
                  <span className={`text-sm font-bold ${myStanding.rankChange > 0 ? "text-emerald-500" : "text-red-400"}`}>
                    {myStanding.rankChange > 0 ? `▲${myStanding.rankChange}` : `▼${Math.abs(myStanding.rankChange)}`}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400 mt-0.5">of {standingsData?.standings.length ?? "—"}</span>
            </div>

            {/* Captain */}
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-medium mb-0.5">Captain</span>
              <span className="text-base font-bold text-slate-900 leading-tight truncate">
                {myGwStats?.captainName ?? "—"}
              </span>
              <span className="text-xs text-slate-400 mt-0.5">
                {myGwStats?.captainPts != null ? `${myGwStats.captainPts} pts` : "—"}
              </span>
            </div>

            {/* Bench pts */}
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-medium mb-0.5">Bench</span>
              <span className="text-3xl font-extrabold leading-none" style={{ color: (myGwStats?.benchPts ?? 0) > 8 ? "#dc2626" : "#64748b" }}>
                {myGwStats?.benchPts ?? "—"}
              </span>
              <span className="text-xs text-slate-400 mt-0.5">pts left</span>
            </div>
          </div>
        </div>
      )}

      {/* Quote card */}
      <div className="bg-[#37003c] rounded-xl px-5 py-4 flex items-start justify-between gap-4 shadow-card">
        <div className="flex-1 min-w-0">
          <p className="text-[#00ff87] text-xs font-semibold uppercase tracking-wider mb-1.5">FPL Wisdom</p>
          <p className="text-white/90 text-sm leading-relaxed italic">
            &ldquo;{QUOTES[quoteIdx]}&rdquo;
          </p>
        </div>
        <button
          onClick={nextQuote}
          className="shrink-0 mt-0.5 text-white/40 hover:text-[#00ff87] transition-colors duration-150"
          title="New quote"
          aria-label="New quote"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>

      {/* Deadline countdown */}
      <DeadlineCountdown />

      {/* Stats row */}
      {standingsData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Gameweek" value={`GW ${standingsData.gameweekId}`} />
          <StatCard label="Leader" value={leader?.displayName ?? "—"} sub={leader ? `${leader.totalPoints} pts` : undefined} highlight />
          <StatCard label="Org Average" value={`${standingsData.orgAverageGwPoints} pts`} sub="this GW" />
          <StatCard label="FPL Average" value={`${standingsData.globalAverageGwPoints} pts`} sub="this GW" />
        </div>
      )}

      {/* Season of Pain counter */}
      <PainCounter />

      {/* Weekly highlights reel */}
      <WeeklyHighlights />

      {/* Pre-GW Horoscope */}
      {standingsData && standingsData.standings.length > 0 && (
        <GwHoroscope standingsData={standingsData} currentManagerId={meData?.managerId} />
      )}

      {/* Post-GW Tribunal */}
      {standingsData && standingsData.standings.length > 0 && (
        <GwTribunal standingsData={standingsData} />
      )}

      {/* GW Punishment */}
      {standingsData && standingsData.standings.length > 0 && (() => {
        const bottom = [...standingsData.standings].sort(
          (a, b) => a.gameweekPoints - b.gameweekPoints
        )[0];
        return (
          <GwPunishment gwId={standingsData.gameweekId} bottomScorer={bottom} />
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Mini leaderboard */}
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Top 5 Standings</h2>
            <Link href="/standings" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              View all →
            </Link>
          </div>

          {standingsLoading && (
            <div className="px-4 py-3 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton height="h-7" width="w-7" rounded />
                  <Skeleton height="h-4" width="w-1/3" />
                  <Skeleton height="h-4" width="w-1/4" className="ml-auto" />
                </div>
              ))}
            </div>
          )}

          {!standingsLoading && top5.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-400">
              No data yet.{" "}
              <Link href="/admin" className="underline text-violet-600 hover:text-violet-700">
                Configure your org
              </Link>{" "}
              to get started.
            </div>
          )}

          {top5.length > 0 && (() => {
            const myManagerId = meData?.managerId;
            const myInTop5 = top5.some((e) => e.managerId === myManagerId);
            const myRowEntry = !myInTop5 && myManagerId
              ? standingsData?.standings.find((e) => e.managerId === myManagerId)
              : undefined;

            const renderRow = (entry: typeof top5[0], isMe: boolean) => (
              <li key={entry.managerId}>
                <Link
                  href={`/members/${entry.managerId}`}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors duration-100 ${
                    isMe
                      ? "bg-[#37003c]/5 border-l-2 border-[#37003c] hover:bg-[#37003c]/10"
                      : "hover:bg-slate-50/60"
                  }`}
                >
                  <RankBadge rank={entry.rank} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isMe ? "text-[#37003c]" : "text-slate-800"}`}>
                      {entry.displayName}{isMe && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#37003c]/60">You</span>}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{entry.teamName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">{entry.totalPoints} <span className="text-xs font-normal text-slate-400">pts</span></p>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <span className="text-xs text-slate-400 tabular-nums">GW {entry.gameweekPoints}</span>
                      <RankArrow change={entry.rankChange} />
                    </div>
                  </div>
                </Link>
              </li>
            );

            return (
              <ul className="divide-y divide-slate-50">
                {top5.map((entry) => renderRow(entry, entry.managerId === myManagerId))}
                {myRowEntry && (
                  <>
                    <li className="px-4 py-1.5 flex items-center gap-2">
                      <div className="flex-1 border-t border-dashed border-slate-200" />
                      <span className="text-[10px] text-slate-300 font-medium shrink-0">your position</span>
                      <div className="flex-1 border-t border-dashed border-slate-200" />
                    </li>
                    {renderRow(myRowEntry, true)}
                  </>
                )}
              </ul>
            );
          })()}
        </div>

        {/* Quick links */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Quick Access</h2>
          <div className="grid grid-cols-1 gap-2">
            <QuickLink href="/standings" icon={<TrophyIcon />} label="Standings" desc="Full gameweek & season table" />
            <QuickLink href="/ownership" icon={<UsersIcon />} label="Ownership" desc="Who owns what in your org" />
            <QuickLink href="/fixtures" icon={<CalendarIcon />} label="Fixtures" desc="Upcoming FPL fixtures & difficulty" />
            <QuickLink href="/admin" icon={<SettingsIcon />} label="Admin" desc="Configure org, sync members" />
          </div>
        </div>
      </div>
      {/* League position chart */}
      <LeaguePositionChart />

      {/* GW Performance Report */}
      {gwRanked.length > 0 && standingsData && (
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
          <button
            onClick={() => setReportOpen((o) => !o)}
            className="w-full px-4 py-3 border-b border-slate-100 flex items-center gap-2 hover:bg-slate-50/60 transition-colors duration-150 text-left"
          >
            <span className="text-base">📊</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-slate-700">GW{standingsData.gameweekId} Performance Report</h2>
              <p className="text-xs text-slate-400">EnergyOne Trading Desk · Internal Use Only</p>
            </div>
            {aiLoading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-violet-400 animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`shrink-0 text-slate-400 transition-transform duration-200 ${reportOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {reportOpen && aiError && (
            <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 text-xs text-red-600">
              AI generation failed: {aiError}
            </div>
          )}
          {reportOpen && (() => {
            const myManagerId = meData?.managerId;
            // Put the logged-in user first, keep GW rank order for everyone else
            const sorted = myManagerId
              ? [
                  ...gwRanked.filter((e) => e.managerId === myManagerId),
                  ...gwRanked.filter((e) => e.managerId !== myManagerId),
                ]
              : gwRanked;

            return (
              <>
                <ul className="divide-y divide-slate-50">
                  {sorted.map((entry) => {
                    const gwRank = gwRanked.findIndex((e) => e.managerId === entry.managerId) + 1;
                    const isMe = entry.managerId === myManagerId;
                    const verdict = aiVerdicts[entry.managerId]
                      ?? gwVerdict(entry, gwRank, gwRanked.length, standingsData.orgAverageGwPoints, standingsData.globalAverageGwPoints);
                    const vsOrg = entry.gameweekPoints - standingsData.orgAverageGwPoints;
                    const isUp = vsOrg > 3;
                    const isDown = vsOrg < -3;
                    return (
                      <li
                        key={entry.managerId}
                        className={`px-4 py-3.5 flex items-start gap-3 ${isMe ? "bg-[#37003c]/5 border-l-2 border-[#37003c]" : ""}`}
                      >
                        <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                          gwRank === 1 ? "bg-amber-400 text-white" : isMe ? "bg-[#37003c] text-white" : "bg-slate-100 text-slate-500"
                        }`}>
                          {gwRank}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${isMe ? "text-[#37003c]" : "text-slate-800"}`}>
                              {entry.displayName}
                              {isMe && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#37003c]/60">You</span>}
                            </span>
                            {entry.chipUsed && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 uppercase tracking-wide">
                                {CHIP_LABELS[entry.chipUsed] ?? entry.chipUsed}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{verdict}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`text-sm font-bold tabular-nums ${isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-slate-700"}`}>
                            {entry.gameweekPoints}
                          </span>
                          <span className="text-xs text-slate-400 ml-0.5">pts</span>
                          <p className={`text-[11px] mt-0.5 tabular-nums ${vsOrg > 0 ? "text-emerald-500" : vsOrg < 0 ? "text-red-400" : "text-slate-400"}`}>
                            {vsOrg > 0 ? "+" : ""}{vsOrg} vs org
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            );
          })()}
          {reportOpen && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-400">
              Org avg: <strong className="text-slate-600">{standingsData.orgAverageGwPoints} pts</strong>
              <span className="mx-2">·</span>
              FPL avg: <strong className="text-slate-600">{standingsData.globalAverageGwPoints} pts</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3.5 border shadow-card ${highlight ? "bg-violet-600 border-violet-500 text-white" : "bg-white border-slate-200/80 text-slate-800"}`}>
      <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${highlight ? "text-violet-200" : "text-slate-400"}`}>{label}</p>
      <p className={`text-base font-bold truncate ${highlight ? "text-white" : "text-slate-900"}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${highlight ? "text-violet-200" : "text-slate-400"}`}>{sub}</p>}
    </div>
  );
}

function QuickLink({ href, icon, label, desc }: { href: string; icon: React.ReactNode; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200/80 rounded-xl hover:border-violet-200 hover:bg-violet-50/40 transition-all duration-150 shadow-card group"
    >
      <span className="shrink-0 text-slate-400 group-hover:text-violet-500 transition-colors">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{label}</p>
        <p className="text-xs text-slate-400 truncate">{desc}</p>
      </div>
      <span className="ml-auto text-slate-300 group-hover:text-violet-400 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </span>
    </Link>
  );
}

function TrophyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/>
      <line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
