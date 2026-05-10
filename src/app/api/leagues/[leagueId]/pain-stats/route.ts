import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length === 0) {
      return ok({
        currentGw: 0,
        managersCount: 0,
        benchPtsTotal: 0,
        hitCostTotal: 0,
        sufferingTotal: 0,
        belowAvgGws: 0,
        worstBenchGw: null,
        biggestHit: null,
        painfulGw: null,
      });
    }

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);

    const histories = await Promise.all(
      memberships.map(async (m) => ({
        member: m,
        history: await fetchEntryHistory(m.managerId),
      })),
    );

    let benchPtsTotal = 0;
    let hitCostTotal = 0;
    let sufferingTotal = 0;
    let belowAvgGws = 0;

    for (let gw = 1; gw <= currentGw; gw++) {
      const gwEntries = histories
        .map(({ history }) => history.current.find((e) => e.event === gw))
        .filter(Boolean);

      if (gwEntries.length === 0) continue;

      const scores = gwEntries.map((e) => e!.points);
      const gwMax = Math.max(...scores);
      const gwAvg = scores.reduce((s, v) => s + v, 0) / scores.length;

      for (const entry of gwEntries) {
        benchPtsTotal += entry!.points_on_bench;
        hitCostTotal += entry!.event_transfers_cost;
        sufferingTotal += gwMax - entry!.points;
        if (entry!.points < gwAvg) belowAvgGws++;
      }
    }

    let worstBenchGw: { managerName: string; pts: number; gw: number } | null = null;
    for (const { member, history } of histories) {
      for (const entry of history.current) {
        if (entry.event > currentGw) continue;
        if (worstBenchGw === null || entry.points_on_bench > worstBenchGw.pts) {
          worstBenchGw = {
            managerName: member.displayName ?? `Manager ${member.managerId}`,
            pts: entry.points_on_bench,
            gw: entry.event,
          };
        }
      }
    }

    let biggestHit: { managerName: string; cost: number; gw: number } | null = null;
    for (const { member, history } of histories) {
      for (const entry of history.current) {
        if (entry.event > currentGw) continue;
        if (entry.event_transfers_cost > 0) {
          if (biggestHit === null || entry.event_transfers_cost > biggestHit.cost) {
            biggestHit = {
              managerName: member.displayName ?? `Manager ${member.managerId}`,
              cost: entry.event_transfers_cost,
              gw: entry.event,
            };
          }
        }
      }
    }

    let painfulGw: { gw: number; totalSuffering: number } | null = null;
    for (let gw = 1; gw <= currentGw; gw++) {
      const gwEntries = histories
        .map(({ history }) => history.current.find((e) => e.event === gw))
        .filter(Boolean);
      if (gwEntries.length === 0) continue;
      const scores = gwEntries.map((e) => e!.points);
      const gwMax = Math.max(...scores);
      const gwSuffering = scores.reduce((s, v) => s + (gwMax - v), 0);
      if (painfulGw === null || gwSuffering > painfulGw.totalSuffering) {
        painfulGw = { gw, totalSuffering: gwSuffering };
      }
    }

    return ok({
      currentGw,
      managersCount: memberships.length,
      benchPtsTotal,
      hitCostTotal,
      sufferingTotal,
      belowAvgGws,
      worstBenchGw,
      biggestHit,
      painfulGw,
    });
  } catch (err) {
    return failFromError(err);
  }
}
