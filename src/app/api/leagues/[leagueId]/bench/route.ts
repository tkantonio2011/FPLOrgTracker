import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BenchRow {
  managerId: number;
  displayName: string;
  teamName: string;
  totalBenchPts: number;
  gwData: { gw: number; benchPts: number; cumulative: number }[];
  worstGw: { gw: number; benchPts: number } | null;
}

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length === 0) {
      return ok({ managers: [], gameweeks: [], currentGw: 0 });
    }

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);

    const results = await Promise.allSettled(
      memberships.map(async (m) => {
        const history = await fetchEntryHistory(m.managerId);
        const gwData: { gw: number; benchPts: number; cumulative: number }[] = [];
        let running = 0;
        for (const entry of history.current) {
          if (entry.event > currentGw) continue;
          running += entry.points_on_bench;
          gwData.push({ gw: entry.event, benchPts: entry.points_on_bench, cumulative: running });
        }
        const worstEntry = gwData.reduce(
          (best, d) => (d.benchPts > best.benchPts ? d : best),
          { gw: 0, benchPts: 0, cumulative: 0 },
        );
        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          teamName: m.teamName ?? "",
          totalBenchPts: running,
          gwData,
          worstGw: worstEntry.gw > 0 ? { gw: worstEntry.gw, benchPts: worstEntry.benchPts } : null,
        };
      }),
    );

    const managers = results
      .filter((r): r is PromiseFulfilledResult<BenchRow> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => b.totalBenchPts - a.totalBenchPts);

    const gwSet = new Set<number>();
    for (const m of managers) for (const d of m.gwData) gwSet.add(d.gw);
    const gameweeks = Array.from(gwSet).sort((a, b) => a - b);

    return ok({ managers, gameweeks, currentGw });
  } catch (err) {
    return failFromError(err);
  }
}
