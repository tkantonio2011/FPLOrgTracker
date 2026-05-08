/**
 * League-scoped standings. Reference implementation for the route migration
 * pattern documented in specs/002-multi-league-platform/contracts/scoped-route-contracts.md
 *
 * Required pattern:
 *   1. `requireLeagueMember(req, params.leagueId)` at the top of the try.
 *   2. Zod-validated query (or body) — no untyped req.json reaching repos.
 *   3. League-scoped data access via repositories — `leagueId` always passed.
 *   4. `ok` / `failFromError` envelope — never raw NextResponse.json.
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchAllLeagueStandings,
  fetchBootstrap,
  fetchEntryHistory,
  getCurrentGw,
  isGameweekLive,
} from "@/lib/fpl/client";
import { buildCacheHeader, getCacheTtl } from "@/lib/cache";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseQuery, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  gw: z.coerce.number().int().min(1).max(38).optional(),
});

interface StandingRow {
  rank: number;
  rankChange: number;
  managerId: number;
  displayName: string;
  teamName: string;
  gameweekPoints: number;
  totalPoints: number;
  overallRank: number;
  chipUsed: string | null;
  pointsBehindLeader: number;
}

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);
    const query = parseQuery(req, querySchema);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length === 0) {
      return ok({
        gameweekId: 0,
        standings: [],
        leagueAverageGwPoints: 0,
        globalAverageGwPoints: 0,
      });
    }

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = query.gw ?? currentGw;
    const isLive = isGameweekLive(bootstrap.events, gw);
    const currentEvent = bootstrap.events.find((e) => e.id === gw);
    const globalAvg = currentEvent?.average_entry_score ?? 0;

    const memberMap = new Map(memberships.map((m) => [m.managerId, m]));
    let standings: StandingRow[] = [];

    if (gw === currentGw && league.miniLeagueId) {
      // Current GW — single league-standings call covers all members.
      const leagueResults = await fetchAllLeagueStandings(league.miniLeagueId);
      // Filter to the league's actual members (the FPL mini-league may include
      // people who aren't in our LeagueMembership any more).
      const relevant = leagueResults.filter((r) => memberMap.has(r.entry));
      standings = relevant.map((r) => {
        const member = memberMap.get(r.entry)!;
        const deduction = member.pointsDeductionPerGw;
        return {
          rank: r.rank,
          rankChange: r.last_rank - r.rank,
          managerId: r.entry,
          displayName: member.displayName ?? r.player_name,
          teamName: member.teamName ?? r.entry_name,
          gameweekPoints: r.event_total - deduction,
          totalPoints: r.total - deduction * gw,
          overallRank: 0,
          chipUsed: null,
          pointsBehindLeader: 0,
        };
      });
    } else {
      // Historical GW (or no mini-league configured): fetch each member's history.
      const histories = await Promise.all(
        memberships.map(async (m) => {
          try {
            const h = await fetchEntryHistory(m.managerId);
            const gwEntry = h.current.find((e) => e.event === gw);
            const chip = h.chips.find((c) => c.event === gw);
            return {
              managerId: m.managerId,
              displayName: m.displayName ?? `Manager ${m.managerId}`,
              teamName: m.teamName ?? "",
              gameweekPoints: (gwEntry?.points ?? 0) - m.pointsDeductionPerGw,
              totalPoints: (gwEntry?.total_points ?? 0) - m.pointsDeductionPerGw * gw,
              chipUsed: chip?.name ?? null,
            };
          } catch {
            return {
              managerId: m.managerId,
              displayName: m.displayName ?? `Manager ${m.managerId}`,
              teamName: m.teamName ?? "",
              gameweekPoints: 0,
              totalPoints: 0,
              chipUsed: null,
            };
          }
        }),
      );
      standings = histories.map((h, i) => ({
        rank: i + 1,
        rankChange: 0,
        managerId: h.managerId,
        displayName: h.displayName,
        teamName: h.teamName,
        gameweekPoints: h.gameweekPoints,
        totalPoints: h.totalPoints,
        overallRank: 0,
        chipUsed: h.chipUsed,
        pointsBehindLeader: 0,
      }));
    }

    // Sort by total descending, assign ranks, compute behind-leader.
    standings.sort((a, b) => b.totalPoints - a.totalPoints);
    const leader = standings[0]?.totalPoints ?? 0;
    standings = standings.map((s, i) => ({
      ...s,
      rank: i + 1,
      pointsBehindLeader: leader - s.totalPoints,
    }));

    const leagueAvg =
      standings.length > 0
        ? Math.round(standings.reduce((sum, s) => sum + s.gameweekPoints, 0) / standings.length)
        : 0;

    const revalidate = getCacheTtl("standings", isLive);
    return ok(
      {
        gameweekId: gw,
        standings,
        leagueAverageGwPoints: leagueAvg,
        globalAverageGwPoints: globalAvg,
      },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } },
    );
  } catch (err) {
    return failFromError(err);
  }
}
