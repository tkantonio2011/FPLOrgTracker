import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org) {
      return NextResponse.json({ error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" }, { status: 404 });
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);

    // Fetch history for all members in parallel
    const histories = await Promise.all(
      org.members.map(async (m) => {
        try {
          const h = await fetchEntryHistory(m.managerId);
          return {
            managerId: m.managerId,
            displayName: m.displayName ?? `Manager ${m.managerId}`,
            gwTotals: Object.fromEntries(
              h.current.map((e) => [e.event, e.total_points - m.pointsDeductionPerGw * e.event])
            ),
          };
        } catch {
          return { managerId: m.managerId, displayName: m.displayName ?? `Manager ${m.managerId}`, gwTotals: {} as Record<number, number> };
        }
      })
    );

    // For each completed GW, rank managers by cumulative total at that point
    const gwCount = Math.min(currentGw, 38);
    const series: Record<number, { gw: number; position: number; totalPoints: number }[]> = {};
    for (const h of histories) series[h.managerId] = [];

    for (let gw = 1; gw <= gwCount; gw++) {
      // Only include GWs where at least one manager has data
      const totals = histories
        .map((h) => ({ managerId: h.managerId, total: h.gwTotals[gw] ?? null }))
        .filter((x) => x.total !== null) as { managerId: number; total: number }[];

      if (totals.length === 0) continue;

      totals.sort((a, b) => b.total - a.total);
      totals.forEach((t, idx) => {
        series[t.managerId].push({ gw, position: idx + 1, totalPoints: t.total });
      });
    }

    const managers = histories.map((h) => ({
      managerId: h.managerId,
      displayName: h.displayName,
      data: series[h.managerId],
    }));

    return NextResponse.json({ managers, memberCount: org.members.length });
  } catch (err) {
    console.error("League history error:", err);
    return NextResponse.json({ error: "Failed to load league history", code: "FPL_API_UNAVAILABLE" }, { status: 503 });
  }
}
