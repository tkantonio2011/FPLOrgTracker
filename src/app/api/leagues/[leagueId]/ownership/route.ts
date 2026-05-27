import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryPicks, getCurrentGw } from "@/lib/fpl/client";
import { buildCacheHeader, getCacheTtl } from "@/lib/cache";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseQuery, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  gw: z.coerce.number().int().min(1).max(38).optional(),
});

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);
    const query = parseQuery(req, querySchema);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = query.gw ?? currentGw;

    const elementMap = new Map(bootstrap.elements.map((e) => [e.id, e]));
    const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t]));

    const ownershipData = new Map<
      number,
      {
        ownerManagers: { managerId: number; displayName: string; isStarting: boolean; isCaptain: boolean }[];
        totalPoints: number;
        captainCount: number;
      }
    >();

    for (const member of memberships) {
      try {
        const picks = await fetchEntryPicks(member.managerId, gw, false);
        for (const pick of picks.picks) {
          const existing = ownershipData.get(pick.element) ?? {
            ownerManagers: [],
            totalPoints: 0,
            captainCount: 0,
          };
          existing.ownerManagers.push({
            managerId: member.managerId,
            displayName: member.displayName ?? `Manager ${member.managerId}`,
            isStarting: pick.position <= 11,
            isCaptain: pick.is_captain,
          });
          if (pick.is_captain) existing.captainCount++;
          ownershipData.set(pick.element, existing);
        }
      } catch {
        // Skip members with private teams
      }
    }

    const totalMembers = memberships.length;

    const players = Array.from(ownershipData.entries())
      .map(([playerId, data]) => {
        const el = elementMap.get(playerId);
        const team = el ? teamMap.get(el.team) : null;
        return {
          playerId,
          webName: el?.web_name ?? `Player ${playerId}`,
          teamShortName: team?.short_name ?? "???",
          elementType: el?.element_type ?? 0,
          form: el?.form ?? "0",
          nowCost: el?.now_cost ?? 0,
          ownerCount: data.ownerManagers.length,
          ownerDisplayNames: data.ownerManagers.map((m) => m.displayName),
          orgOwnershipPercent:
            totalMembers > 0
              ? Math.round((data.ownerManagers.length / totalMembers) * 100 * 10) / 10
              : 0,
          captainCount: data.captainCount,
          totalPointsForOwners: data.totalPoints,
          isStartingForAllOwners: data.ownerManagers.every((m) => m.isStarting),
        };
      })
      .sort((a, b) => b.ownerCount - a.ownerCount);

    const revalidate = getCacheTtl("ownership", false);
    return ok(
      { gameweekId: gw, players, totalMembers },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } },
    );
  } catch (err) {
    return failFromError(err);
  }
}
