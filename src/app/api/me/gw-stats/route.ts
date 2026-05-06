import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionManagerId } from "@/lib/auth";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const managerId = getSessionManagerId(req);
  if (!managerId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const [bootstrap, history] = await Promise.all([
      fetchBootstrap(),
      fetchEntryHistory(managerId),
    ]);

    const currentGw = getCurrentGw(bootstrap.events);

    const gwEntry = history.current.find((e) => e.event === currentGw);
    if (!gwEntry)
      return NextResponse.json({ error: "No data for current GW" }, { status: 404 });

    const chip = history.chips.find((c) => c.event === currentGw);

    // Deduction from member record
    const member = await db.member.findUnique({ where: { managerId } });
    const deduction = member?.pointsDeductionPerGw ?? 0;

    const playerName = new Map(bootstrap.elements.map((e) => [e.id, e.web_name]));

    // Fetch picks + live pts in parallel
    let captainId: number | null = null;
    try {
      const picks = await fetchEntryPicks(managerId, currentGw);
      captainId = picks.picks.find((p) => p.is_captain)?.element ?? null;
    } catch {
      // Private team or GW not started
    }

    const liveGw = await fetchLiveGw(currentGw);
    const liveMap = new Map(liveGw.elements.map((el) => [el.id, el.stats.total_points]));

    const captainName = captainId ? (playerName.get(captainId) ?? null) : null;
    const captainPts = captainId ? (liveMap.get(captainId) ?? 0) : 0;

    return NextResponse.json({
      gameweekId: currentGw,
      gwScore: gwEntry.points - deduction,
      totalPoints: gwEntry.total_points - deduction * history.current.length,
      benchPts: gwEntry.points_on_bench,
      captainName,
      captainPts,
      chipUsed: chip?.name ?? null,
    });
  } catch (err) {
    console.error("[GET /api/me/gw-stats]", err);
    return NextResponse.json({ error: "Failed to fetch GW stats" }, { status: 500 });
  }
}
