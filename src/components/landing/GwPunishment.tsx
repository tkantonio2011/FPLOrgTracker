"use client";

import { useState } from "react";

// ── Punishments list ──────────────────────────────────────────────────────────
// Placeholders: {name} = first name, {score} = GW score, {team} = team name

const PUNISHMENTS = [
  "Must send a voice note to the group chat explaining their captain pick in the style of a post-match manager interview.",
  "Owes everyone in the org a round of coffee. No exceptions. No decaf.",
  "Must rename their FPL team to '{team} (Sorry)' for the next gameweek.",
  "Required to write a formal two-paragraph incident report on what went wrong, submitted to the group chat by Thursday.",
  "Must publicly name their starting XI for next GW in the group chat before the deadline. No take-backs.",
  "Banned from using the phrase 'I nearly captained him' for the rest of the season.",
  "Must accept every single FPL suggestion from the group chat next gameweek. No veto.",
  "Compulsory viewing: the full 90-minute highlight reel of their captain's blank. Must confirm they watched it.",
  "Sentenced to a 30-second voice message to the group chat explaining why they didn't just captain Salah.",
  "Must wear a rival team's shirt on the next video call. No hiding. Camera on.",
  "Required to explain their transfer strategy using only a whiteboard diagram, live, in the group chat.",
  "Owes the group a full written post-mortem: what went wrong, why, and the five-point remediation plan.",
  "Must pick their entire next gameweek squad using only the suggestions of one other group member.",
  "Banned from making any transfer in GW{nextGw} without a group vote of at least 60% approval.",
  "Required to send a handwritten apology to their bench players for leaving them unused.",
  "Sentenced to having their next GW captain chosen by the person who scored highest this week.",
  "Must operate a strict 'no premium assets' policy next gameweek. Budget squad or bust.",
  "Compulsory reading: the full FPL rules. A quiz will follow. Minimum pass mark: 70%.",
  "Must start the next GW with a minus-four hit, just for the experience of knowing how it feels.",
  "Required to provide the group with a live commentary on their team's performance throughout the next gameweek, via the group chat.",
  "Sentenced to having zero chips available for the rest of the season. (Honorary ruling — cannot be enforced, but it's the thought that counts.)",
  "Must change their profile picture in the FPL app to a photo of their captain's face from this gameweek.",
  "Owes the group a detailed scouting report on three differential picks for next week, citing xG and recent form.",
  "Required to compliment each of the top three scorers this GW with a personalised message in the group chat.",
  "Banned from mentioning price rises, xA, or 'he's due a big one' for two full gameweeks.",
  "Must donate one imaginary FPL point to each other member. Symbolically devastating.",
  "Sentenced to making their GW{nextGw} transfers live on a group call, with real-time commentary from the highest scorer.",
  "Required to attend an emergency session of FPL Anonymous. Step one: admitting the captain pick was a mistake.",
  "Must submit a formal transfer request for their captain to the group chat, citing 'gross underperformance and a failure to deliver on agreed KPIs'.",
  "Compulsory one-week social media ban on any FPL content. Cold turkey. It's for their own good.",
  "Must produce a PowerPoint (minimum 4 slides) justifying their bench selection for the GW. Pie chart required.",
  "Sentenced to picking exclusively from the bottom three clubs in the Premier League for their next GW squad.",
  "Required to get a Jira ticket raised for this performance. Priority: Critical. Assignee: themselves.",
];

// ── Component ─────────────────────────────────────────────────────────────────

interface StandingsEntry {
  managerId: number;
  displayName: string;
  teamName: string;
  gameweekPoints: number;
}

interface Props {
  gwId: number;
  bottomScorer: StandingsEntry;
}

export function GwPunishment({ gwId, bottomScorer }: Props) {
  // Deterministic starting index so the same GW always shows the same punishment first
  const seed  = (gwId * 7 + bottomScorer.managerId * 3) % PUNISHMENTS.length;
  const [offset, setOffset] = useState(0);

  const idx         = (seed + offset) % PUNISHMENTS.length;
  const firstName   = bottomScorer.displayName.split(" ")[0];
  const nextGw      = gwId + 1;

  const punishment  = PUNISHMENTS[idx]
    .replace(/\{name\}/g, firstName)
    .replace(/\{score\}/g, String(bottomScorer.gameweekPoints))
    .replace(/\{team\}/g, bottomScorer.teamName)
    .replace(/\{nextGw\}/g, String(nextGw));

  const spin = () => setOffset((o) => (o + 1) % PUNISHMENTS.length);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-amber-200/70 bg-amber-100/60 flex items-center gap-3">
        <span className="text-lg shrink-0">⚖️</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
            GW{gwId} Sentence
          </p>
          <p className="text-sm font-semibold text-amber-900 truncate">
            {bottomScorer.displayName}
            <span className="font-normal text-amber-700/80"> · {bottomScorer.gameweekPoints} pts · bottom of the org</span>
          </p>
        </div>
        {/* Spin button */}
        <button
          onClick={spin}
          title="Alternative punishment"
          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-800 bg-amber-200/60 hover:bg-amber-200 px-2.5 py-1.5 rounded-lg transition-colors duration-150"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          Spin
        </button>
      </div>

      {/* Punishment text */}
      <div className="px-4 py-4">
        <p className="text-sm font-medium text-amber-900 leading-relaxed">
          {punishment}
        </p>
        <p className="text-[10px] text-amber-500 mt-3 font-medium">
          {idx + 1} of {PUNISHMENTS.length} · click Spin for alternatives
        </p>
      </div>
    </div>
  );
}
