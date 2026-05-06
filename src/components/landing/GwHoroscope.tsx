"use client";

import { useEffect, useRef, useState } from "react";

interface HoroscopeEntry {
  managerId: number;
  sign: string;
  signEmoji: string;
  prediction: string;
}

interface StandingsEntry {
  managerId: number;
  displayName: string;
  teamName: string;
  totalPoints: number;
  rank: number;
  chipUsed: string | null;
}

interface StandingsData {
  gameweekId: number;
  standings: StandingsEntry[];
}

const SIGN_COLOURS: Record<string, string> = {
  "The Gas Peaker":          "text-orange-400",
  "The Negative Price":      "text-red-400",
  "The Baseload Beast":      "text-slate-400",
  "The Force Majeure":       "text-purple-400",
  "The Curtailment":         "text-yellow-400",
  "The Short Squeeze":       "text-rose-400",
  "The Interconnector":      "text-cyan-400",
  "The Imbalance Settler":   "text-amber-400",
  "The Day-Ahead Dreamer":   "text-blue-300",
  "The Merchant Plant":      "text-green-400",
  "The Arbitrageur":         "text-emerald-400",
  "The Balancing Mechanism": "text-indigo-400",
};

// ── Star icon ─────────────────────────────────────────────────────────────────
function StarIcon({ className }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GwHoroscope({ standingsData, currentManagerId }: { standingsData: StandingsData; currentManagerId?: number }) {
  const [horoscopes, setHoroscopes] = useState<HoroscopeEntry[] | null>(null);
  const [nextGw, setNextGw]         = useState<number | null>(null);
  const [loading, setLoading]       = useState(false);
  const [open, setOpen]             = useState(false);
  const generatedRef                = useRef<number | null>(null);

  const gwId = standingsData.gameweekId;

  useEffect(() => {
    if (generatedRef.current === gwId) return;
    generatedRef.current = gwId;

    const cacheKey = `horoscope-v4-gw${gwId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { horoscopes: HoroscopeEntry[]; nextGw: number };
        setHoroscopes(parsed.horoscopes);
        setNextGw(parsed.nextGw);
        if (currentManagerId) setOpen(true);
        return;
      }
    } catch { /* ignore */ }

    setLoading(true);
    fetch("/api/horoscope", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameweekId: gwId,
        managers: standingsData.standings.map((m) => ({
          managerId:   m.managerId,
          displayName: m.displayName,
          teamName:    m.teamName,
          totalPoints: m.totalPoints,
          orgRank:     m.rank,
          chipUsed:    m.chipUsed,
        })),
      }),
    })
      .then(async (r) => {
        if (!r.ok) return; // silently absent if Groq not configured (501)
        const json = await r.json() as { horoscopes?: HoroscopeEntry[]; nextGw?: number };
        if (!json.horoscopes || json.horoscopes.length === 0) return;
        setHoroscopes(json.horoscopes);
        setNextGw(json.nextGw ?? gwId + 1);
        if (currentManagerId) setOpen(true);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ horoscopes: json.horoscopes, nextGw: json.nextGw ?? gwId + 1 }));
          for (let g = 1; g < gwId; g++) {
            localStorage.removeItem(`horoscope-v4-gw${g}`);
            localStorage.removeItem(`horoscope-v3-gw${g}`);
            localStorage.removeItem(`horoscope-v2-gw${g}`);
            localStorage.removeItem(`horoscope-gw${g}`);
          }
        } catch { /* ignore */ }
      })
      .catch(() => { /* silently absent */ })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gwId]);

  if (!loading && !horoscopes) return null;

  return (
    <div
      className="rounded-xl overflow-hidden shadow-card border border-indigo-900/40"
      style={{ background: "linear-gradient(135deg, #07071a 0%, #0f0f2e 55%, #07071a 100%)" }}
    >
      {/* Header — clickable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:brightness-110 transition-all duration-150"
      >
        {/* Pulsing star dot */}
        <span className="relative shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 block" />
          {!loading && horoscopes && (
            <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-50" />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              Pre-Deadline · GW{nextGw ?? gwId + 1}
            </span>
            <span className="text-[10px] text-indigo-900/60 font-semibold">Madame FPL</span>
          </div>
          <p className="text-sm font-bold text-white mt-0.5">
            ✨ GW{nextGw ?? gwId + 1} Horoscope Readings
          </p>
          <p className="text-xs text-indigo-300/60 mt-0.5">
            The stars have consulted your xG. Your deadline approaches.
          </p>
        </div>

        <StarIcon className="shrink-0 text-indigo-400/50 hidden sm:block" />

        {loading && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-indigo-400 animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        )}

        {!loading && horoscopes && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`shrink-0 text-indigo-400/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        )}
      </button>

      {/* Body — collapsible */}
      {open && horoscopes && (() => {
        const sorted = currentManagerId
          ? [
              ...horoscopes.filter((h) => h.managerId === currentManagerId),
              ...horoscopes.filter((h) => h.managerId !== currentManagerId),
            ]
          : horoscopes;

        return (
        <div className="border-t border-indigo-900/30 px-4 pb-5 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sorted.map((h) => {
              const isMe    = h.managerId === currentManagerId;
              const manager    = standingsData.standings.find((m) => m.managerId === h.managerId);
              const signColour = SIGN_COLOURS[h.sign] ?? "text-indigo-300";
              return (
                <div
                  key={h.managerId}
                  className={`rounded-lg px-3.5 py-3 border ${isMe ? "border-indigo-500/60 col-span-1 sm:col-span-2" : "border-indigo-800/25"}`}
                  style={{ background: isMe ? "rgba(99, 102, 241, 0.15)" : "rgba(79, 70, 229, 0.07)" }}
                >
                  {/* Manager name + sign */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xl leading-none ${signColour}`} aria-label={h.sign}>
                      {h.signEmoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white/90 truncate leading-tight">
                          {manager?.displayName ?? `Manager ${h.managerId}`}
                        </span>
                        {isMe && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                            You
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold leading-tight ${signColour}`}>
                        {h.sign} · {manager?.teamName ?? ""}
                      </span>
                    </div>
                  </div>

                  {/* Prediction */}
                  <p className={`text-[11px] leading-relaxed italic ${isMe ? "text-indigo-200/90" : "text-indigo-200/70"}`}>
                    {h.prediction}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <p className="text-[10px] text-indigo-900/50 text-right pt-3 border-t border-indigo-900/20 mt-3">
            Madame FPL · GW{nextGw ?? gwId + 1} Pre-Deadline Oracle · AI-generated cosmic nonsense
          </p>
        </div>
        );
      })()}
    </div>
  );
}
