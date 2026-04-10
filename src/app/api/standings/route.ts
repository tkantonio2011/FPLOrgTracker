import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchAllLeagueStandings, fetchEntryHistory, getCurrentGw, isGameweekLive } from "@/lib/fpl/client";
import { getCacheTtl, buildCacheHeader } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gwParam = searchParams.get("gw");

    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org) {
      return NextResponse.json({ error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" }, { status: 404 });
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = gwParam ? parseInt(gwParam) : currentGw;
    const isLive = isGameweekLive(bootstrap.events, gw);

    const currentEvent = bootstrap.events.find((e) => e.id === gw);
    const globalAvg = currentEvent?.average_entry_score ?? 0;

    // Build member lookup
    const memberMap = new Map(org.members.map((m) => [m.managerId, m]));

    let standings: {
      rank: number;
      rankChange: number;
      managerId: number;
      displayName: string;
      teamName: string;
      gameweekPoints: number;
      totalPoints: number;
      overallRank: number;
      chipUsed: string | null;
      pointsBehindLeader: number;
    }[] = [];

    if (gw === currentGw && org.miniLeagueId) {
      // Current GW: use league standings endpoint (fast, single call)
      const leagueResults = await fetchAllLeagueStandings(org.miniLeagueId);
      const relevant = leagueResults.filter((r) => memberMap.has(r.entry) || org.members.length === 0);
      standings = relevant.map((r) => {
        const member = memberMap.get(r.entry);
        const deduction = member?.pointsDeductionPerGw ?? 0;
        return {
          rank: r.rank,
          rankChange: r.last_rank - r.rank,
          managerId: r.entry,
          displayName: member?.displayName ?? r.player_name,
          teamName: member?.teamName ?? r.entry_name,
          gameweekPoints: r.event_total - deduction,
          totalPoints: r.total - deduction * gw,
          overallRank: 0,
          chipUsed: null,
          pointsBehindLeader: 0,
        };
      });
    } else {
      // Historical GW (or no league): fetch each manager's history individually
      const members = org.members.length > 0 ? org.members : [];
      const histories = await Promise.all(
        members.map(async (m) => {
          try {
            const h = await fetchEntryHistory(m.managerId);
            const gwEntry = h.current.find((e) => e.event === gw);
            const chip = h.chips.find((c) => c.event === gw);
            const deduction = m.pointsDeductionPerGw;
            return {
              managerId: m.managerId,
              displayName: m.displayName ?? `Manager ${m.managerId}`,
              teamName: m.teamName ?? "",
              gameweekPoints: (gwEntry?.points ?? 0) - deduction,
              totalPoints: (gwEntry?.total_points ?? 0) - deduction * gw,
              chipUsed: chip?.name ?? null,
            };
          } catch {
            return {
              managerId: m.managerId,
              displayName: m.displayName ?? `Manager ${m.managerId}`,
              teamName: m.teamName ?? "",
              gameweekPoints: 0,
              totalPoints: 0,
              chipUsed: null,
            };
          }
        })
      );
      standings = histories.map((h, i) => ({
        rank: i + 1,
        rankChange: 0,
        managerId: h.managerId,
        displayName: h.displayName,
        teamName: h.teamName,
        gameweekPoints: h.gameweekPoints,
        totalPoints: h.totalPoints,
        overallRank: 0,
        chipUsed: h.chipUsed,
        pointsBehindLeader: 0,
      }));
    }

    // Sort by total points descending and assign rank
    standings.sort((a, b) => b.totalPoints - a.totalPoints);
    const leader = standings[0]?.totalPoints ?? 0;
    standings = standings.map((s, i) => ({
      ...s,
      rank: i + 1,
      pointsBehindLeader: leader - s.totalPoints,
    }));

    const orgAvg =
      standings.length > 0
        ? Math.round(standings.reduce((sum, s) => sum + s.gameweekPoints, 0) / standings.length)
        : 0;

    const revalidate = getCacheTtl("standings", isLive);
    return NextResponse.json(
      { gameweekId: gw, standings, orgAverageGwPoints: orgAvg, globalAverageGwPoints: globalAvg },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } }
    );
  } catch (err) {
    console.error("Standings error:", err);
    return NextResponse.json({ error: "FPL API unavailable", code: "FPL_API_UNAVAILABLE" }, { status: 503 });
  }
}
