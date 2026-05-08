import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryPicks,
  fetchFixtures,
  FplApiError,
  getCurrentGw,
  isGameweekLive,
} from "@/lib/fpl/client";
import { generateCaptainSuggestions } from "@/lib/suggestions/captain";
import { buildCacheHeader, getCacheTtl } from "@/lib/cache";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseQuery, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  managerId: z.coerce.number().int().positive(),
  gw: z.coerce.number().int().min(1).max(38).optional(),
});

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);
    const query = parseQuery(req, querySchema);

    const membership = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: league.id, managerId: query.managerId } },
    });
    if (!membership || !membership.isActive) {
      return fail("Manager is not a member of this league", 404);
    }

    let bootstrap, fixtures;
    try {
      [bootstrap, fixtures] = await Promise.all([fetchBootstrap(), fetchFixtures()]);
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = query.gw ?? currentGw;
    const live = isGameweekLive(bootstrap.events, gw);

    let picks;
    try {
      picks = await fetchEntryPicks(query.managerId, gw, live);
    } catch (err) {
      if (err instanceof FplApiError && (err.status === 403 || err.status === 404)) {
        return fail("Manager's team is private", 403);
      }
      throw err;
    }

    // League ownership map — sample up to 20 active members (perf cap).
    const leagueMembers = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
      take: 20,
    });
    const leagueOwnership = new Map<number, number>();
    for (const member of leagueMembers) {
      try {
        const memberPicks = await fetchEntryPicks(member.managerId, gw, live);
        for (const p of memberPicks.picks) {
          leagueOwnership.set(p.element, (leagueOwnership.get(p.element) ?? 0) + 1);
        }
      } catch {
        // private team — skip
      }
    }

    const suggestions = generateCaptainSuggestions({
      picks: picks.picks,
      elements: bootstrap.elements,
      teams: bootstrap.teams,
      fixtures,
      currentGw: gw,
      orgOwnership: leagueOwnership,
      orgMemberCount: leagueMembers.length || 1,
    });

    const revalidate = getCacheTtl("suggestions", live);
    return ok(
      { managerId: query.managerId, gameweekId: gw, suggestions },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } },
    );
  } catch (err) {
    return failFromError(err);
  }
}
