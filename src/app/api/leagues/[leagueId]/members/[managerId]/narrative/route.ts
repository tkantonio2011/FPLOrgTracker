/**
 * League-scoped season narrative — LLM-generated "Season So Far" paragraph
 * for one manager, computed against the manager's own league context.
 *
 * Replaces the legacy `/api/members/[managerId]/narrative` route which read
 * from the single-tenant `Organisation`/`Member` models. The narrative's
 * "rank vs the rest of the league" framing now uses LeagueMembership rows
 * scoped by `leagueId`.
 */

import type { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
};

const paramsSchema = z.object({
  leagueId: z.string(),
  managerId: z.coerce.number().int().positive(),
});

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string; managerId: string } },
) {
  try {
    const params = paramsSchema.parse(ctx.params);
    const { league } = await requireLeagueMember(req, params.leagueId);

    if (!process.env.GROQ_API_KEY) {
      return fail("GROQ_API_KEY not configured", 501);
    }

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length === 0) {
      return fail("League has no active members", 404);
    }

    const member = memberships.find((m) => m.managerId === params.managerId);
    if (!member) {
      return fail("Manager is not a member of this league", 404);
    }

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);

    // Pull every league member's history once — the prompt needs league rank
    // and league-average context. FPL client caches these for the request.
    const allHistories = await Promise.all(
      memberships.map(async (m) => ({
        member: m,
        history: await fetchEntryHistory(m.managerId),
      })),
    );

    const targetEntry = allHistories.find((h) => h.member.managerId === params.managerId);
    if (!targetEntry) {
      return fail("Manager history unavailable", 503);
    }

    const played = targetEntry.history.current.filter((e) => e.event <= currentGw);
    if (played.length === 0) {
      return ok({ narrative: null, gw: currentGw, managerId: params.managerId });
    }

    const totalPoints = played[played.length - 1].total_points;
    const avgScore =
      Math.round((played.reduce((s, e) => s + e.points, 0) / played.length) * 10) / 10;
    const bestGw = played.reduce((b, e) => (e.points > b.points ? e : b), played[0]);
    const worstGw = played.reduce((b, e) => (e.points < b.points ? e : b), played[0]);
    const totalBenchPts = played.reduce((s, e) => s + e.points_on_bench, 0);
    const totalHitCost = played.reduce((s, e) => s + e.event_transfers_cost, 0);
    const recentForm = played
      .slice(-3)
      .map((e) => `GW${e.event}: ${e.points}`)
      .join(", ");

    const chipsUsed =
      targetEntry.history.chips
        .map((c) => `${CHIP_LABELS[c.name] ?? c.name} (GW${c.event})`)
        .join(", ") || "none";

    const leagueTotals = allHistories
      .map(({ member: m, history: h }) => {
        const p = h.current.filter((e) => e.event <= currentGw);
        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          total: p[p.length - 1]?.total_points ?? 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    const leagueSize = leagueTotals.length;
    const leagueRank = leagueTotals.findIndex((m) => m.managerId === params.managerId) + 1;
    const leader = leagueTotals[0];
    const bottom = leagueTotals[leagueTotals.length - 1];

    const ptsGapFromLeader =
      leader.managerId !== params.managerId ? leader.total - totalPoints : null;
    const ptsAheadOfBottom =
      bottom.managerId !== params.managerId ? totalPoints - bottom.total : null;

    const leagueAvgGwScore =
      Math.round(
        (allHistories.reduce((sum, { history: h }) => {
          const p = h.current.filter((e) => e.event <= currentGw);
          return sum + p.reduce((s, e) => s + e.points, 0) / (p.length || 1);
        }, 0) /
          leagueSize) *
          10,
      ) / 10;

    const memberFirstName = member.displayName?.split(" ")[0] ?? "They";

    const leaderLine =
      ptsGapFromLeader != null
        ? `Points behind league leader (${leader.displayName.split(" ")[0]}): ${ptsGapFromLeader} pts`
        : `${memberFirstName} IS the league leader`;

    const bottomLine =
      ptsAheadOfBottom != null
        ? `Points ahead of last place (${bottom.displayName.split(" ")[0]}): ${ptsAheadOfBottom} pts`
        : `${memberFirstName} IS last place`;

    const contextBlock = [
      `Manager: ${member.displayName ?? `Manager ${params.managerId}`} ("${member.teamName ?? "Unknown"}")`,
      `League: ${league.name}`,
      `Season GW 1–${currentGw} | ${played.length} gameweeks played`,
      `Total points: ${totalPoints} | League position: ${leagueRank} of ${leagueSize}`,
      leaderLine,
      bottomLine,
      `Avg GW score: ${avgScore} pts (league avg: ${leagueAvgGwScore} pts)`,
      `Best GW: GW${bestGw.event} (${bestGw.points} pts) | Worst GW: GW${worstGw.event} (${worstGw.points} pts)`,
      `Bench pts wasted: ${totalBenchPts} pts`,
      `Transfer hit cost: −${totalHitCost} pts`,
      `Chips used: ${chipsUsed}`,
      `Recent form (last 3 GWs): ${recentForm}`,
    ].join("\n");

    const isTop = leagueRank === 1;
    const isBottom = leagueRank === leagueSize;
    const positionHint = isTop
      ? "They are currently leading the league — write with smug confidence but hint at the fragility of their position."
      : isBottom
        ? "They are currently bottom of the league — be brutal but almost sympathetic, like a club programme piece on a relegated player."
        : leagueRank <= Math.ceil(leagueSize / 2)
          ? "They are in the top half but not leading — write with cautious optimism, wry self-awareness."
          : "They are in the lower half — write with the resigned tone of a mid-table side that talks itself into believing a late run is possible.";

    const prompt = `You are writing the "Season So Far" entry in the official League FPL Programme — an internal publication for a private fantasy football mini-league. This is the season profile for one of the ${leagueSize} managers in the league.

Stats:
${contextBlock}

Tone guidance: ${positionHint}

Write a single paragraph (3–5 sentences) in the style of a football match programme player biography — authoritative, slightly dramatic, but quietly savage. Rules:
- Write in the THIRD PERSON — never "you" or "your"
- Use their first name naturally; reference their team name at least once
- Generic office / financial-markets humour is welcome (spreads, hedging, P&L, Jira, sprints, pipelines, incident reports) — keep it broad rather than tied to any one industry
- Reference at least two specific numbers from the stats above (points wasted on bench, hit cost, GW scores, pts behind leader, etc.)
- One sentence should be purely factual setup; the next should land the twist or the joke
- Do not end with generic motivation or future hope — end on an observation about the present situation
- Output ONLY the paragraph — no title, no heading, no markdown, no surrounding quotes`;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 1.1,
      max_tokens: 320,
    });

    const narrative = completion.choices[0]?.message?.content?.trim() ?? null;
    return ok({ narrative, gw: currentGw, managerId: params.managerId });
  } catch (err) {
    return failFromError(err);
  }
}
