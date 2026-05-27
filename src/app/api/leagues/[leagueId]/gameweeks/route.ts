/**
 * League-scoped gameweeks endpoint. The data itself is global (FPL bootstrap)
 * but we still gate access by league membership so unauthenticated/unauthorised
 * users can't probe the platform via this endpoint.
 */

import type { NextRequest } from "next/server";
import { fetchBootstrap, getCurrentGw } from "@/lib/fpl/client";
import { buildCacheHeader, getCacheTtl } from "@/lib/cache";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    await requireLeagueMember(req, ctx.params.leagueId);

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);
    const currentEvent = bootstrap.events.find((e) => e.is_current);
    const isLive = currentEvent ? currentEvent.is_current && !currentEvent.finished : false;

    const gameweeks = bootstrap.events.map((e) => ({
      id: e.id,
      name: e.name,
      deadlineTime: e.deadline_time,
      isFinished: e.finished,
      isCurrent: e.is_current,
      isNext: e.is_next,
      averageEntryScore: e.average_entry_score,
      highestScore: e.highest_score,
    }));

    const revalidate = getCacheTtl("bootstrap", isLive);
    return ok(
      { currentGameweek: currentGw, gameweeks },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } },
    );
  } catch (err) {
    return failFromError(err);
  }
}
