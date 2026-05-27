import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntry,
  fetchEntryHistory,
  FplApiError,
} from "@/lib/fpl/client";
import { buildCacheHeader, getCacheTtl } from "@/lib/cache";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    const membership = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: league.id, managerId: params.managerId } },
    });
    if (!membership || !membership.isActive) {
      return fail("Manager is not a member of this league", 404);
    }

    let entryHistory, bootstrap, entry;
    try {
      [entryHistory, bootstrap, entry] = await Promise.all([
        fetchEntryHistory(params.managerId),
        fetchBootstrap(),
        fetchEntry(params.managerId),
      ]);
    } catch (err) {
      if (err instanceof FplApiError && err.status === 404) {
        return fail("Member not found", 404);
      }
      return fail("FPL API unavailable", 503);
    }

    const gwAvgMap = new Map<number, number>();
    for (const event of bootstrap.events) gwAvgMap.set(event.id, event.average_entry_score);

    const chipMap = new Map<number, string>();
    for (const chip of entryHistory.chips) chipMap.set(chip.event, chip.name);

    const history = entryHistory.current.map((h) => ({
      gameweekId: h.event,
      points: h.points,
      totalPoints: h.total_points,
      pointsOnBench: h.points_on_bench,
      overallRank: h.overall_rank,
      transfersMade: h.event_transfers,
      transfersCost: h.event_transfers_cost,
      chipUsed: chipMap.get(h.event) ?? null,
      globalAvgPoints: gwAvgMap.get(h.event) ?? null,
      // Renamed from `orgAvgPoints` for the new league-scoped contract; left
      // null here because computing the per-GW league average requires a
      // separate batch fetch — the standings endpoint does it, so consumers
      // that need the average should pull it from there.
      leagueAvgPoints: null,
    }));

    let bestGw = { id: 0, points: -Infinity };
    let worstGw = { id: 0, points: Infinity };
    let totalBenchPoints = 0;
    let totalTransferCost = 0;

    for (const h of entryHistory.current) {
      if (h.points > bestGw.points) bestGw = { id: h.event, points: h.points };
      if (h.points < worstGw.points) worstGw = { id: h.event, points: h.points };
      totalBenchPoints += h.points_on_bench;
      totalTransferCost += h.event_transfers_cost;
    }

    const totalPoints =
      entryHistory.current.length > 0
        ? entryHistory.current[entryHistory.current.length - 1].total_points
        : 0;

    const seasonSummary = {
      totalPoints,
      bestGameweek: bestGw.id > 0 ? { id: bestGw.id, points: bestGw.points } : null,
      worstGameweek: worstGw.id > 0 ? { id: worstGw.id, points: worstGw.points } : null,
      totalBenchPoints,
      totalTransferCost,
    };

    const displayName =
      membership.displayName ?? `${entry.player_first_name} ${entry.player_last_name}`.trim();
    const teamName = membership.teamName ?? entry.name;

    const revalidate = getCacheTtl("history", false);
    return ok(
      {
        managerId: params.managerId,
        displayName,
        teamName,
        history,
        seasonSummary,
      },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } },
    );
  } catch (err) {
    return failFromError(err);
  }
}
