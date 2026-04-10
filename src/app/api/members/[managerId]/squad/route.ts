import { NextRequest, NextResponse } from "next/server";
import {
  fetchBootstrap,
  fetchEntryPicks,
  fetchLiveGw,
  getCurrentGw,
  isGameweekLive,
  FplApiError,
} from "@/lib/fpl/client";
import { getCacheTtl, buildCacheHeader } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { managerId: string } }
) {
  const managerId = parseInt(params.managerId, 10);
  if (isNaN(managerId)) {
    return NextResponse.json(
      { error: "Invalid managerId", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  try {
    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);

    const { searchParams } = new URL(req.url);
    const gwParam = searchParams.get("gw");
    const gw = gwParam ? parseInt(gwParam, 10) : currentGw;

    if (isNaN(gw)) {
      return NextResponse.json(
        { error: "Invalid gw param", code: "VALIDATION_ERROR" },
        { status: 422 }
      );
    }

    const isLiveGw = isGameweekLive(bootstrap.events, gw);
    const isActiveGw = gw === currentGw;

    const entryPicks = await fetchEntryPicks(managerId, gw, isActiveGw);

    // Build element lookup maps
    const elementMap = new Map(bootstrap.elements.map((el) => [el.id, el]));
    const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t]));

    // For the active/live GW, fetch live scoring data
    let liveMap = new Map<number, number>();
    if (isLiveGw) {
      const liveData = await fetchLiveGw(gw);
      for (const el of liveData.elements) {
        liveMap.set(el.id, el.stats.total_points);
      }
    }

    const picks = entryPicks.picks.map((pick) => {
      const element = elementMap.get(pick.element);
      const team = element ? teamMap.get(element.team) : undefined;
      const isStarting = pick.position <= 11;

      let points = 0;
      if (isLiveGw) {
        points = liveMap.get(pick.element) ?? 0;
      } else {
        // For completed GWs, use event_points from bootstrap element
        points = element?.event_points ?? 0;
      }

      return {
        position: pick.position,
        playerId: pick.element,
        webName: element?.web_name ?? `Player ${pick.element}`,
        teamShortName: team?.short_name ?? "",
        elementType: element?.element_type ?? 0,
        isStarting,
        isCaptain: pick.is_captain,
        isViceCaptain: pick.is_vice_captain,
        multiplier: pick.multiplier,
        points,
        epNext: parseFloat(element?.ep_next ?? "0"),
        status: element?.status ?? "a",
        news: element?.news ?? "",
      };
    });

    const revalidate = getCacheTtl("picks", isLiveGw);
    return NextResponse.json(
      {
        managerId,
        gameweekId: gw,
        activeChip: entryPicks.active_chip,
        picks,
      },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } }
    );
  } catch (err) {
    if (err instanceof FplApiError && (err.status === 404 || err.status === 403)) {
      return NextResponse.json(
        { error: "Manager's team is set to private", code: "MANAGER_PRIVATE" },
        { status: 403 }
      );
    }
    console.error("Squad route error:", err);
    return NextResponse.json(
      { error: "FPL API unavailable", code: "FPL_API_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
