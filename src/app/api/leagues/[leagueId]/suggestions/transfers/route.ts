import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchFixtures,
  FplApiError,
  getCurrentGw,
  isGameweekLive,
} from "@/lib/fpl/client";
import { generateTransferSuggestions } from "@/lib/suggestions/transfers";
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

    // Manager must belong to this league.
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

    const history = await fetchEntryHistory(query.managerId);
    const gwHistory = history.current.find((h) => h.event === gw);
    const bank = gwHistory?.bank ?? 0;
    const freeTransfers = Math.max(0, 2 - (gwHistory?.event_transfers ?? 0));

    const suggestions = generateTransferSuggestions({
      picks,
      elements: bootstrap.elements,
      teams: bootstrap.teams,
      fixtures,
      bank,
      freeTransfers,
      currentGw: gw,
    });

    const revalidate = getCacheTtl("suggestions", live);
    return ok(
      { managerId: query.managerId, gameweekId: gw, freeTransfers, bank, suggestions },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } },
    );
  } catch (err) {
    return failFromError(err);
  }
}
