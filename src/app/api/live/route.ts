import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchLiveGw,
  fetchEntryPicks,
  getCurrentGw,
  isGameweekLive,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" },
        { status: 404 }
      );
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);
    const isLive = isGameweekLive(bootstrap.events, currentGw);
    const currentEvent = bootstrap.events.find((e) => e.id === currentGw);

    // Build player name + team map
    const playerMap = new Map(
      bootstrap.elements.map((e) => [e.id, { name: e.web_name, team: e.team }])
    );

    // Fetch live scoring data
    const liveData = await fetchLiveGw(currentGw);
    const livePointsMap = new Map(
      liveData.elements.map((e) => [e.id, e.stats])
    );

    // Fetch each manager's picks in parallel
    const results = await Promise.allSettled(
      org.members.map(async (m) => {
        const picks = await fetchEntryPicks(m.managerId, currentGw, true);
        const chip = picks.active_chip;

        // Sum live points: FPL already encodes the correct multiplier per pick
        // (captain=2, triple cap=3, bench boost bench players=1, normal bench=0)
        let liveTotal = 0;
        let captainInfo: { name: string; livePoints: number; multiplier: number } | null = null;

        for (const pick of picks.picks) {
          if (pick.multiplier === 0) continue; // benched and not playing

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

        // Apply per-GW transfer deduction
        const deduction = m.pointsDeductionPerGw ?? 0;
        liveTotal -= deduction;

        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          teamName: m.teamName ?? "",
          livePoints: liveTotal,
          chipUsed: chip,
          captain: captainInfo,
        };
      })
    );

    const managers = results
      .filter(
        (r): r is PromiseFulfilledResult<{
          managerId: number;
          displayName: string;
          teamName: string;
          livePoints: number;
          chipUsed: string | null;
          captain: { name: string; livePoints: number; multiplier: number } | null;
        }> => r.status === "fulfilled"
      )
      .map((r) => r.value)
      .sort((a, b) => b.livePoints - a.livePoints)
      .map((m, i) => ({ ...m, rank: i + 1 }));

    const headers: Record<string, string> = {
      "Cache-Control": isLive ? "no-store" : "public, max-age=300",
    };

    return NextResponse.json(
      {
        gameweekId: currentGw,
        gameweekName: currentEvent?.name ?? `GW ${currentGw}`,
        isLive,
        isFinished: currentEvent?.finished ?? false,
        managers,
      },
      { headers }
    );
  } catch (err) {
    console.error("[GET /api/live]", err);
    return NextResponse.json(
      { error: "Failed to fetch live data", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
