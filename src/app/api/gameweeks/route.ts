import { NextResponse } from "next/server";
import { fetchBootstrap, getCurrentGw } from "@/lib/fpl/client";
import { getCacheTtl, buildCacheHeader } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);
    const currentEvent = bootstrap.events.find((e) => e.is_current);
    const isLive = currentEvent ? currentEvent.is_current && !currentEvent.finished : false;

    const gameweeks = bootstrap.events.map((e) => ({
      id: e.id,
      name: e.name,
      deadlineTime: e.deadline_time,
      isFinished: e.finished,
      isCurrent: e.is_current,
      isNext: e.is_next,
      averageEntryScore: e.average_entry_score,
      highestScore: e.highest_score,
    }));

    const revalidate = getCacheTtl("bootstrap", isLive);
    return NextResponse.json(
      { currentGameweek: currentGw, gameweeks },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } }
    );
  } catch {
    return NextResponse.json({ error: "FPL API unavailable", code: "FPL_API_UNAVAILABLE" }, { status: 503 });
  }
}
