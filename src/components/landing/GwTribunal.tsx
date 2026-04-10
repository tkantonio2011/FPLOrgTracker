"use client";

import { useEffect, useRef, useState } from "react";

interface QA {
  question: string;
  answer: string;
}

interface TribunalData {
  gw: number;
  managerId: number;
  managerName: string;
  teamName: string;
  gwScore: number;
  captainName: string;
  captainPts: number | null;
  intro: string;
  qa: QA[];
}

interface StandingsEntry {
  managerId: number;
  displayName: string;
  teamName: string;
  gameweekPoints: number;
  rankChange: number;
  chipUsed: string | null;
}

interface StandingsData {
  gameweekId: number;
  orgAverageGwPoints: number;
  standings: StandingsEntry[];
}

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  bboost:   "Bench Boost",
  "3xc":    "Triple Captain",
  freehit:  "Free Hit",
};

// ── Microphone icon ───────────────────────────────────────────────────────────
function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GwTribunal({
  standingsData,
}: {
  standingsData: StandingsData;
}) {
  const [tribunal, setTribunal] = useState<TribunalData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const generatedRef            = useRef<number | null>(null);

  // Sort by GW pts ascending → last entry = bottom scorer
  const gwRanked   = [...standingsData.standings].sort(
    (a, b) => a.gameweekPoints - b.gameweekPoints
  );
  const bottom     = gwRanked[0];
  const gwId       = standingsData.gameweekId;

  useEffect(() => {
    if (!bottom || generatedRef.current === gwId) return;
    generatedRef.current = gwId;

    // Check localStorage cache first
    const cacheKey = `tribunal-gw${gwId}-${bottom.managerId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setTribunal(JSON.parse(cached) as TribunalData);
        return;
      }
    } catch {
      // ignore
    }

    // Generate
    setLoading(true);
    fetch("/api/tribunal", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameweekId:  gwId,
        managerId:   bottom.managerId,
        managerName: bottom.displayName,
        teamName:    bottom.teamName,
        gwScore:     bottom.gameweekPoints,
        orgAvg:      standingsData.orgAverageGwPoints,
        rankChange:  bottom.rankChange,
        chipUsed:    bottom.chipUsed ? CHIP_LABELS[bottom.chipUsed] ?? bottom.chipUsed : null,
      }),
    })
      .then(async (r) => {
        if (!r.ok) return; // silently absent if Groq not configured (501)
        const data = (await r.json()) as TribunalData;
        if (!data.intro) return;
        setTribunal(data);
        // Cache — evict older GWs
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
          for (let i = 1; i < gwId; i++) {
            localStorage.removeItem(`tribunal-gw${i}-${bottom.managerId}`);
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // silently absent on error
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gwId, bottom?.managerId]);

  // Don't render if no data and not loading
  if (!loading && !tribunal) return null;

  const firstName = bottom.displayName.split(" ")[0];

  return (
    <div className="rounded-xl overflow-hidden shadow-card border border-red-900/40"
      style={{ background: "linear-gradient(135deg, #1a0505 0%, #2d0a0a 50%, #1a0510 100%)" }}>

      {/* Header — clickable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:brightness-110 transition-all duration-150"
      >
        {/* Pulsing red dot */}
        <span className="relative shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 block" />
          {!loading && tribunal && (
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
              Live · Press Conference
            </span>
            <span className="text-[10px] text-red-900/60 font-semibold">The FPL Gazette</span>
          </div>
          <p className="text-sm font-bold text-white mt-0.5">
            GW{gwId} Tribunal — {bottom.displayName}
          </p>
          <p className="text-xs text-red-300/70 mt-0.5">
            {bottom.gameweekPoints} pts · bottom of the org · {bottom.teamName}
          </p>
        </div>

        {/* Mic icon */}
        <span className="shrink-0 text-red-400/70 hidden sm:block">
          <MicIcon />
        </span>

        {loading && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-red-400 animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        )}

        {!loading && tribunal && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`shrink-0 text-red-400/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        )}
      </button>

      {/* Body — collapsible */}
      {open && tribunal && (
        <div className="px-4 pb-5 space-y-4 border-t border-red-900/30">

          {/* Intro / scene-setter */}
          <p className="text-sm text-red-200/80 italic pt-4 leading-relaxed">
            {tribunal.intro}
          </p>

          {/* Q&A pairs */}
          <div className="space-y-4">
            {tribunal.qa.map((item, i) => (
              <div key={i} className="space-y-2">
                {/* Question */}
                <div className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-800/60 text-red-300 text-[10px] font-black">
                      Q
                    </span>
                  </span>
                  <div>
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide block mb-0.5">
                      Malcolm Sharp · The FPL Gazette
                    </span>
                    <p className="text-sm font-semibold text-white/90 leading-snug">
                      {item.question}
                    </p>
                  </div>
                </div>

                {/* Answer */}
                <div className="flex items-start gap-2.5 ml-1">
                  <span className="shrink-0 mt-0.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-700/60 text-slate-300 text-[10px] font-black">
                      A
                    </span>
                  </span>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">
                      {firstName} · {tribunal.teamName}
                    </span>
                    <p className="text-sm text-slate-300/90 leading-snug">
                      {item.answer}
                    </p>
                  </div>
                </div>

                {/* Divider between Q&As */}
                {i < tribunal.qa.length - 1 && (
                  <div className="border-t border-red-900/20 pt-1" />
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="text-[10px] text-red-900/50 text-right pt-1 border-t border-red-900/20">
            The FPL Gazette · GW{gwId} Post-Match · AI-generated satire
          </p>
        </div>
      )}
    </div>
  );
}
