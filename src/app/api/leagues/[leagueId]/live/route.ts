import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchLiveGw,
  fetchEntryPicks,
  getCurrentGw,
  isGameweekLive,
} from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LiveManager {
  managerId: number;
  displayName: string;
  teamName: string;
  livePoints: number;
  chipUsed: string | null;
  captain: { name: string; livePoints: number; multiplier: number } | null;
}

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

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
    const isLive = isGameweekLive(bootstrap.events, currentGw);
    const currentEvent = bootstrap.events.find((e) => e.id === currentGw);

    const playerMap = new Map(bootstrap.elements.map((e) => [e.id, { name: e.web_name, team: e.team }]));

    const liveData = await fetchLiveGw(currentGw);
    const livePointsMap = new Map(liveData.elements.map((e) => [e.id, e.stats]));

    const results = await Promise.allSettled(
      memberships.map(async (m) => {
        const picks = await fetchEntryPicks(m.managerId, currentGw, true);
        const chip = picks.active_chip;

        let liveTotal = 0;
        let captainInfo: { name: string; livePoints: number; multiplier: number } | null = null;

        for (const pick of picks.picks) {
          if (pick.multiplier === 0) continue;
          const stats = livePointsMap.get(pick.element);
          const basePoints = stats?.total_points ?? 0;
          const pts = basePoints * pick.multiplier;
          liveTotal += pts;
          if (pick.is_captain) {
            const player = playerMap.get(pick.element);
            captainInfo = {
              name: player?.name ?? "Unknown",
              livePoints: pts,
              multiplier: pick.multiplier,
            };
          }
        }
        liveTotal -= m.pointsDeductionPerGw;

        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          teamName: m.teamName ?? "",
          livePoints: liveTotal,
          chipUsed: chip,
          captain: captainInfo,
        };
      }),
    );

    const managers = results
      .filter((r): r is PromiseFulfilledResult<LiveManager> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => b.livePoints - a.livePoints)
      .map((m, i) => ({ ...m, rank: i + 1 }));

    const headers: Record<string, string> = {
      "Cache-Control": isLive ? "no-store" : "public, max-age=300",
    };

    return ok(
      {
        gameweekId: currentGw,
        gameweekName: currentEvent?.name ?? `GW ${currentGw}`,
        isLive,
        isFinished: currentEvent?.finished ?? false,
        managers,
      },
      { headers },
    );
  } catch (err) {
    return failFromError(err);
  }
}
