import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchEntryHistory, getCurrentGw, fetchBootstrap } from "@/lib/fpl/client";

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

    const results = await Promise.allSettled(
      org.members.map(async (m) => {
        const history = await fetchEntryHistory(m.managerId);

        // Build per-GW bench data from the history (up to current GW)
        const gwData: { gw: number; benchPts: number; cumulative: number }[] = [];
        let running = 0;

        for (const entry of history.current) {
          if (entry.event > currentGw) continue;
          running += entry.points_on_bench;
          gwData.push({
            gw: entry.event,
            benchPts: entry.points_on_bench,
            cumulative: running,
          });
        }

        const worstEntry = gwData.reduce(
          (best, d) => (d.benchPts > best.benchPts ? d : best),
          { gw: 0, benchPts: 0, cumulative: 0 }
        );

        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          teamName: m.teamName ?? "",
          totalBenchPts: running,
          gwData,
          worstGw: worstEntry.gw > 0 ? { gw: worstEntry.gw, benchPts: worstEntry.benchPts } : null,
        };
      })
    );

    const managers = results
      .filter(
        (r): r is PromiseFulfilledResult<{
          managerId: number;
          displayName: string;
          teamName: string;
          totalBenchPts: number;
          gwData: { gw: number; benchPts: number; cumulative: number }[];
          worstGw: { gw: number; benchPts: number } | null;
        }> => r.status === "fulfilled"
      )
      .map((r) => r.value)
      .sort((a, b) => b.totalBenchPts - a.totalBenchPts);

    // All GWs seen across all managers
    const gwSet = new Set<number>();
    for (const m of managers) for (const d of m.gwData) gwSet.add(d.gw);
    const gameweeks = Array.from(gwSet).sort((a, b) => a - b);

    return NextResponse.json({ managers, gameweeks, currentGw });
  } catch (err) {
    console.error("[GET /api/bench]", err);
    return NextResponse.json(
      { error: "Failed to fetch bench data", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
