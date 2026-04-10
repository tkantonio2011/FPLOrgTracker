import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryPicks, getCurrentGw } from "@/lib/fpl/client";
import { getCacheTtl, buildCacheHeader } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org) {
      return NextResponse.json({ error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" }, { status: 404 });
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = parseInt(searchParams.get("gw") ?? String(currentGw));

    const elementMap = new Map(bootstrap.elements.map((e) => [e.id, e]));
    const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t]));

    // Aggregate ownership across all members
    const ownershipData = new Map<
      number,
      {
        ownerManagers: { managerId: number; displayName: string; isStarting: boolean; isCaptain: boolean }[];
        totalPoints: number;
        captainCount: number;
      }
    >();

    for (const member of org.members) {
      try {
        const picks = await fetchEntryPicks(member.managerId, gw, false);
        for (const pick of picks.picks) {
          const existing = ownershipData.get(pick.element) ?? {
            ownerManagers: [],
            totalPoints: 0,
            captainCount: 0,
          };
          existing.ownerManagers.push({
            managerId: member.managerId,
            displayName: member.displayName ?? `Manager ${member.managerId}`,
            isStarting: pick.position <= 11,
            isCaptain: pick.is_captain,
          });
          if (pick.is_captain) existing.captainCount++;
          ownershipData.set(pick.element, existing);
        }
      } catch {
        // Skip members with private teams
      }
    }

    const totalMembers = org.members.length;

    const players = Array.from(ownershipData.entries())
      .map(([playerId, data]) => {
        const el = elementMap.get(playerId);
        const team = el ? teamMap.get(el.team) : null;
        return {
          playerId,
          webName: el?.web_name ?? `Player ${playerId}`,
          teamShortName: team?.short_name ?? "???",
          elementType: el?.element_type ?? 0,
          form: el?.form ?? "0",
          nowCost: el?.now_cost ?? 0,
          ownerCount: data.ownerManagers.length,
          ownerDisplayNames: data.ownerManagers.map((m) => m.displayName),
          orgOwnershipPercent: Math.round((data.ownerManagers.length / totalMembers) * 100 * 10) / 10,
          captainCount: data.captainCount,
          totalPointsForOwners: data.totalPoints,
          isStartingForAllOwners: data.ownerManagers.every((m) => m.isStarting),
        };
      })
      .sort((a, b) => b.ownerCount - a.ownerCount);

    const revalidate = getCacheTtl("ownership", false);
    return NextResponse.json(
      { gameweekId: gw, players, totalMembers },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } }
    );
  } catch (err) {
    console.error("Ownership error:", err);
    return NextResponse.json({ error: "FPL API unavailable", code: "FPL_API_UNAVAILABLE" }, { status: 503 });
  }
}
