import { NextRequest, NextResponse } from "next/server";
import { fetchEntryHistory, fetchBootstrap, fetchEntry, FplApiError } from "@/lib/fpl/client";
import { getCacheTtl, buildCacheHeader } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
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
    const [entryHistory, bootstrap, entry] = await Promise.all([
      fetchEntryHistory(managerId),
      fetchBootstrap(),
      fetchEntry(managerId),
    ]);

    // Build a map of GW -> global average from bootstrap events
    const gwAvgMap = new Map<number, number>();
    for (const event of bootstrap.events) {
      gwAvgMap.set(event.id, event.average_entry_score);
    }

    // Build a map of GW -> chip used from chips history
    const chipMap = new Map<number, string>();
    for (const chip of entryHistory.chips) {
      chipMap.set(chip.event, chip.name);
    }

    // Map history entries
    const history = entryHistory.current.map((h) => ({
      gameweekId: h.event,
      points: h.points,
      totalPoints: h.total_points,
      pointsOnBench: h.points_on_bench,
      overallRank: h.overall_rank,
      transfersMade: h.event_transfers,
      transfersCost: h.event_transfers_cost,
      chipUsed: chipMap.get(h.event) ?? null,
      globalAvgPoints: gwAvgMap.get(h.event) ?? null,
      orgAvgPoints: null,
    }));

    // Compute season summary
    let bestGw = { id: 0, points: -Infinity };
    let worstGw = { id: 0, points: Infinity };
    let totalBenchPoints = 0;
    let totalTransferCost = 0;

    for (const h of entryHistory.current) {
      if (h.points > bestGw.points) {
        bestGw = { id: h.event, points: h.points };
      }
      if (h.points < worstGw.points) {
        worstGw = { id: h.event, points: h.points };
      }
      totalBenchPoints += h.points_on_bench;
      totalTransferCost += h.event_transfers_cost;
    }

    const totalPoints =
      entryHistory.current.length > 0
        ? entryHistory.current[entryHistory.current.length - 1].total_points
        : 0;

    const seasonSummary = {
      totalPoints,
      bestGameweek:
        bestGw.id > 0 ? { id: bestGw.id, points: bestGw.points } : null,
      worstGameweek:
        worstGw.id > 0 ? { id: worstGw.id, points: worstGw.points } : null,
      totalBenchPoints,
      totalTransferCost,
    };

    const displayName = `${entry.player_first_name} ${entry.player_last_name}`.trim();
    const teamName = entry.name;

    const revalidate = getCacheTtl("history", false);
    return NextResponse.json(
      { managerId, displayName, teamName, history, seasonSummary },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } }
    );
  } catch (err) {
    if (err instanceof FplApiError && err.status === 404) {
      return NextResponse.json(
        { error: "Member not found", code: "MEMBER_NOT_FOUND" },
        { status: 404 }
      );
    }
    console.error("Performance route error:", err);
    return NextResponse.json(
      { error: "FPL API unavailable", code: "FPL_API_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
