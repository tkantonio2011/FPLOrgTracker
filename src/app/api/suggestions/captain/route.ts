import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchFixtures, fetchEntryPicks, getCurrentGw, isGameweekLive, FplApiError } from "@/lib/fpl/client";
import { generateCaptainSuggestions } from "@/lib/suggestions/captain";
import { getCacheTtl, buildCacheHeader } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const managerId = parseInt(searchParams.get("managerId") ?? "0");
    if (!managerId) {
      return NextResponse.json({ error: "managerId is required", code: "VALIDATION_ERROR" }, { status: 422 });
    }

    const [bootstrap, fixtures] = await Promise.all([fetchBootstrap(), fetchFixtures()]);
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = parseInt(searchParams.get("gw") ?? String(currentGw));
    const live = isGameweekLive(bootstrap.events, gw);

    let picks;
    try {
      picks = await fetchEntryPicks(managerId, gw, live);
    } catch (err) {
      if (err instanceof FplApiError && (err.status === 403 || err.status === 404)) {
        return NextResponse.json({ error: "Manager's team is private", code: "MANAGER_PRIVATE" }, { status: 403 });
      }
      throw err;
    }

    // Build org ownership map
    const org = await db.organisation.findFirst({ include: { members: { where: { isActive: true } } } });
    const orgOwnership = new Map<number, number>();

    if (org) {
      for (const member of org.members.slice(0, 20)) {
        try {
          const memberPicks = await fetchEntryPicks(member.managerId, gw, live);
          for (const p of memberPicks.picks) {
            orgOwnership.set(p.element, (orgOwnership.get(p.element) ?? 0) + 1);
          }
        } catch {
          // Skip private teams
        }
      }
    }

    const suggestions = generateCaptainSuggestions({
      picks: picks.picks,
      elements: bootstrap.elements,
      teams: bootstrap.teams,
      fixtures,
      currentGw: gw,
      orgOwnership,
      orgMemberCount: org?.members.length ?? 1,
    });

    const revalidate = getCacheTtl("suggestions", live);
    return NextResponse.json(
      { managerId, gameweekId: gw, suggestions },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } }
    );
  } catch (err) {
    console.error("Captain suggestions error:", err);
    return NextResponse.json({ error: "FPL API unavailable", code: "FPL_API_UNAVAILABLE" }, { status: 503 });
  }
}
