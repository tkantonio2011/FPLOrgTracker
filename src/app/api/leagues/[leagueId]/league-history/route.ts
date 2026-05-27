import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length === 0) return ok({ managers: [], memberCount: 0 });

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);

    const histories = await Promise.all(
      memberships.map(async (m) => {
        try {
          const h = await fetchEntryHistory(m.managerId);
          return {
            managerId: m.managerId,
            displayName: m.displayName ?? `Manager ${m.managerId}`,
            gwTotals: Object.fromEntries(
              h.current.map((e) => [e.event, e.total_points - m.pointsDeductionPerGw * e.event]),
            ),
          };
        } catch {
          return {
            managerId: m.managerId,
            displayName: m.displayName ?? `Manager ${m.managerId}`,
            gwTotals: {} as Record<number, number>,
          };
        }
      }),
    );

    const gwCount = Math.min(currentGw, 38);
    const series: Record<number, { gw: number; position: number; totalPoints: number }[]> = {};
    for (const h of histories) series[h.managerId] = [];

    for (let gw = 1; gw <= gwCount; gw++) {
      const totals = histories
        .map((h) => ({ managerId: h.managerId, total: h.gwTotals[gw] ?? null }))
        .filter((x): x is { managerId: number; total: number } => x.total !== null);
      if (totals.length === 0) continue;
      totals.sort((a, b) => b.total - a.total);
      totals.forEach((t, idx) => {
        series[t.managerId].push({ gw, position: idx + 1, totalPoints: t.total });
      });
    }

    const managers = histories.map((h) => ({
      managerId: h.managerId,
      displayName: h.displayName,
      data: series[h.managerId],
    }));

    return ok({ managers, memberCount: memberships.length });
  } catch (err) {
    return failFromError(err);
  }
}
