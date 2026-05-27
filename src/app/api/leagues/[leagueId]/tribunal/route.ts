/**
 * League-scoped post-GW press-conference tribunal. The manager who finished
 * BOTTOM of the league this GW faces three pointed questions from Malcolm
 * Sharp, senior correspondent at The FPL Gazette.
 *
 * Replaces the legacy `/api/tribunal` which: (a) accepted unauthenticated
 * POSTs, and (b) read `db.organisation` for the league-size context.
 */

import type { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, fetchEntryPicks, fetchLiveGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseBody, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  gameweekId: z.number().int().min(1).max(38),
  managerId: z.number().int().positive(),
  managerName: z.string(),
  teamName: z.string(),
  gwScore: z.number().int(),
  leagueAvg: z.number(),
  rankChange: z.number().int(),
  chipUsed: z.string().nullable(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    if (!process.env.GROQ_API_KEY) {
      return fail("GROQ_API_KEY not configured", 501);
    }

    const body = await parseBody(req, bodySchema);
    const { gameweekId, managerId, managerName, teamName, gwScore, leagueAvg, rankChange, chipUsed } = body;

    // Confirm the target manager actually belongs to this league.
    const target = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: league.id, managerId } },
    });
    if (!target || !target.isActive) {
      return fail("Manager is not an active member of this league", 404);
    }

    // League size for prompt context.
    const leagueSize = await db.leagueMembership.count({
      where: { leagueId: league.id, isActive: true },
    });

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const playersById = new Map(bootstrap.elements.map((e) => [e.id, e]));

    // ── Captain name + pts ──────────────────────────────────────────────────
    let captainName = "their captain";
    let captainPts: number | null = null;

    try {
      const picks = await fetchEntryPicks(managerId, gameweekId);
      const captainPick = picks.picks.find((p) => p.is_captain);
      if (captainPick) {
        const player = playersById.get(captainPick.element);
        captainName = player
          ? `${player.first_name} ${player.second_name}`
          : "their captain";
        try {
          const liveGw = await fetchLiveGw(gameweekId);
          const liveEl = liveGw.elements.find((e) => e.id === captainPick.element);
          if (liveEl) captainPts = liveEl.stats.total_points;
        } catch {
          // Live data unavailable — proceed without pts
        }
      }
    } catch {
      // Picks unavailable (private team or future GW) — proceed without captain info
    }

    // ── Bench pts + transfer cost for this GW ───────────────────────────────
    let benchPts: number | null = null;
    let hitCost: number | null = null;
    let seasonTotal: number | null = null;

    try {
      const history = await fetchEntryHistory(managerId);
      const gwEntry = history.current.find((e) => e.event === gameweekId);
      if (gwEntry) {
        benchPts = gwEntry.points_on_bench;
        hitCost = gwEntry.event_transfers_cost;
        seasonTotal = gwEntry.total_points;
      }
    } catch {
      // History unavailable — proceed without
    }

    // ── Build context ───────────────────────────────────────────────────────
    const firstName = managerName.split(" ")[0];
    const ptsDiff = gwScore - leagueAvg;
    const chipLine = chipUsed ? `Chip played this GW: ${chipUsed}` : "No chip played";

    const contextLines = [
      `Manager: ${managerName} ("${teamName}")`,
      `GW${gameweekId} score: ${gwScore} pts — BOTTOM of the league (league average: ${leagueAvg} pts, gap: ${ptsDiff} pts)`,
      captainPts !== null
        ? `Captain: ${captainName} — scored ${captainPts} pts (captain gets ${captainPts * 2} pts after multiplier)`
        : `Captain: ${captainName}`,
      benchPts !== null ? `Bench pts left on the bench this GW: ${benchPts}` : null,
      hitCost && hitCost > 0 ? `Transfer hit cost paid this GW: −${hitCost} pts` : "No transfer hits taken",
      chipLine,
      rankChange < 0
        ? `League rank change: dropped ${Math.abs(rankChange)} place${Math.abs(rankChange) !== 1 ? "s" : ""}`
        : rankChange > 0
          ? `League rank change: climbed ${rankChange} place${rankChange !== 1 ? "s" : ""}`
          : "League rank: unchanged",
      seasonTotal !== null ? `Season total so far: ${seasonTotal} pts` : null,
      `League size: ${leagueSize} managers`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are writing a fictional post-GW FPL press conference for a private fantasy football mini-league.

${firstName} has just finished BOTTOM of the league this gameweek. They must face three pointed questions from Malcolm Sharp, senior correspondent at The FPL Gazette.

Factual context:
${contextLines}

Generate a JSON object with EXACTLY this structure:
{
  "intro": "One vivid sentence setting the scene as ${firstName} enters the press conference. Dry, slightly savage. Reference their team name.",
  "qa": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ]
}

Rules for questions:
- Malcolm is polite but absolutely merciless — each question references a specific stat (captain pts, bench waste, gw score vs average, rank drop)
- Questions are short and pointed, like a proper journalist going for the throat

Rules for answers:
- ${firstName} is defensive, rationalising, slightly delusional — classic post-match manager speak
- Generic office / financial-markets metaphors welcome (risk model, hedging, pipeline, Jira, sprints, deployments, P&L) but keep them broadly relatable rather than tied to any one industry
- Answers are 2–3 sentences — confident on the surface, crumbling underneath
- Occasionally they contradict themselves between answers

General rules:
- Darkly funny, not cruel — this is affectionate friendly-league banter
- Output ONLY valid JSON. No markdown fences, no extra text, no trailing commas.`;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 1.15,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as {
      intro?: string;
      qa?: { question: string; answer: string }[];
    };

    if (!parsed.intro || !Array.isArray(parsed.qa) || parsed.qa.length === 0) {
      return fail("Malformed AI response", 500);
    }

    return ok({
      gw: gameweekId,
      managerId,
      managerName,
      teamName,
      gwScore,
      captainName,
      captainPts,
      intro: parsed.intro,
      qa: parsed.qa.slice(0, 3),
    });
  } catch (err) {
    return failFromError(err);
  }
}
