/**
 * League-scoped per-manager GW stats — returns the current user's GW score,
 * total points, bench pts, captain, and chip used for THIS league. The
 * deduction comes from the LeagueMembership row (different leagues may apply
 * different per-GW deductions to the same manager).
 *
 * Replaces the legacy `/api/me/gw-stats` which read the legacy `user_session`
 * cookie and `db.member`.
 */

import type { NextRequest } from "next/server";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    const { user, membership } = await requireLeagueMember(req, ctx.params.leagueId);
    if (!membership) {
      // Super Admin viewing a league they aren't a member of has no
      // personal GW stats here.
      return fail("Not a member of this league", 404);
    }

    const managerId = membership.managerId;

    // Re-fetch full membership for `pointsDeductionPerGw` — the resolver
    // returns only the narrow projection.
    const full = await db.leagueMembership.findUnique({ where: { id: membership.id } });
    const deduction = full?.pointsDeductionPerGw ?? 0;

    let bootstrap, history;
    try {
      [bootstrap, history] = await Promise.all([
        fetchBootstrap(),
        fetchEntryHistory(managerId),
      ]);
    } catch {
      return fail("FPL API unavailable", 503);
    }

    const currentGw = getCurrentGw(bootstrap.events);

    const gwEntry = history.current.find((e) => e.event === currentGw);
    if (!gwEntry) {
      return fail("No data for current GW", 404);
    }

    const chip = history.chips.find((c) => c.event === currentGw);

    const playerName = new Map(bootstrap.elements.map((e) => [e.id, e.web_name]));

    let captainId: number | null = null;
    try {
      const picks = await fetchEntryPicks(managerId, currentGw);
      captainId = picks.picks.find((p) => p.is_captain)?.element ?? null;
    } catch {
      // Private team or GW not started — no captain available.
    }

    const liveGw = await fetchLiveGw(currentGw);
    const liveMap = new Map(liveGw.elements.map((el) => [el.id, el.stats.total_points]));

    const captainName = captainId ? (playerName.get(captainId) ?? null) : null;
    const captainPts = captainId ? (liveMap.get(captainId) ?? 0) : 0;

    // Mark `user` as touched — needed for the auth gate above but not the
    // response payload.
    void user;

    return ok({
      gameweekId: currentGw,
      gwScore: gwEntry.points - deduction,
      totalPoints: gwEntry.total_points - deduction * history.current.length,
      benchPts: gwEntry.points_on_bench,
      captainName,
      captainPts,
      chipUsed: chip?.name ?? null,
    });
  } catch (err) {
    return failFromError(err);
  }
}
