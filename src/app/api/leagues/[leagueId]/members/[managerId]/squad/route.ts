import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryPicks,
  fetchLiveGw,
  FplApiError,
  getCurrentGw,
  isGameweekLive,
} from "@/lib/fpl/client";
import { buildCacheHeader, getCacheTtl } from "@/lib/cache";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseQuery, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({
  leagueId: z.string(),
  managerId: z.coerce.number().int().positive(),
});

const querySchema = z.object({
  gw: z.coerce.number().int().min(1).max(38).optional(),
});

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string; managerId: string } },
) {
  try {
    const params = paramsSchema.parse(ctx.params);
    const query = parseQuery(req, querySchema);
    const { league } = await requireLeagueMember(req, params.leagueId);

    const membership = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: league.id, managerId: params.managerId } },
    });
    if (!membership || !membership.isActive) {
      return fail("Manager is not a member of this league", 404);
    }

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = query.gw ?? currentGw;

    const isLiveGw = isGameweekLive(bootstrap.events, gw);
    const isActiveGw = gw === currentGw;

    let entryPicks;
    try {
      entryPicks = await fetchEntryPicks(params.managerId, gw, isActiveGw);
    } catch (err) {
      if (err instanceof FplApiError && (err.status === 404 || err.status === 403)) {
        return fail("Manager's team is set to private", 403);
      }
      throw err;
    }

    const elementMap = new Map(bootstrap.elements.map((el) => [el.id, el]));
    const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t]));

    const liveMap = new Map<number, number>();
    if (isLiveGw) {
      const liveData = await fetchLiveGw(gw);
      for (const el of liveData.elements) liveMap.set(el.id, el.stats.total_points);
    }

    const picks = entryPicks.picks.map((pick) => {
      const element = elementMap.get(pick.element);
      const team = element ? teamMap.get(element.team) : undefined;
      const isStarting = pick.position <= 11;
      const points = isLiveGw
        ? liveMap.get(pick.element) ?? 0
        : element?.event_points ?? 0;
      return {
        position: pick.position,
        playerId: pick.element,
        webName: element?.web_name ?? `Player ${pick.element}`,
        teamShortName: team?.short_name ?? "",
        elementType: element?.element_type ?? 0,
        isStarting,
        isCaptain: pick.is_captain,
        isViceCaptain: pick.is_vice_captain,
        multiplier: pick.multiplier,
        points,
        epNext: parseFloat(element?.ep_next ?? "0"),
        status: element?.status ?? "a",
        news: element?.news ?? "",
      };
    });

    const revalidate = getCacheTtl("picks", isLiveGw);
    return ok(
      {
        managerId: params.managerId,
        gameweekId: gw,
        activeChip: entryPicks.active_chip,
        picks,
      },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } },
    );
  } catch (err) {
    return failFromError(err);
  }
}
