import { NextRequest, NextResponse } from "next/server";
import { fetchBootstrap, fetchFixtures, fetchEntryPicks, fetchEntryHistory, getCurrentGw, isGameweekLive, FplApiError } from "@/lib/fpl/client";
import { generateTransferSuggestions } from "@/lib/suggestions/transfers";
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

    const history = await fetchEntryHistory(managerId);
    const gwHistory = history.current.find((h) => h.event === gw);
    const bank = gwHistory?.bank ?? 0;
    const freeTransfers = Math.max(0, 2 - (gwHistory?.event_transfers ?? 0));

    const suggestions = generateTransferSuggestions({
      picks,
      elements: bootstrap.elements,
      teams: bootstrap.teams,
      fixtures,
      bank,
      freeTransfers,
      currentGw: gw,
    });

    const revalidate = getCacheTtl("suggestions", live);
    return NextResponse.json(
      { managerId, gameweekId: gw, freeTransfers, bank, suggestions },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } }
    );
  } catch (err) {
    console.error("Transfer suggestions error:", err);
    return NextResponse.json({ error: "FPL API unavailable", code: "FPL_API_UNAVAILABLE" }, { status: 503 });
  }
}
