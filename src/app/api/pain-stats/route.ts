import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org || org.members.length === 0) {
      return NextResponse.json(
        { error: "ORG_NOT_CONFIGURED", code: "ORG_NOT_CONFIGURED" },
        { status: 404 }
      );
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);

    const histories = await Promise.all(
      org.members.map(async (m) => ({
        member: m,
        history: await fetchEntryHistory(m.managerId),
      }))
    );

    // ── Per-GW org stats ───────────────────────────────────────────────────────
    let benchPtsTotal  = 0;
    let hitCostTotal   = 0;
    let sufferingTotal = 0;  // sum of (GW winner score − each manager's score) per GW
    let belowAvgGws    = 0;  // count of (manager, GW) pairs where score < org avg that GW

    for (let gw = 1; gw <= currentGw; gw++) {
      const gwEntries = histories
        .map(({ history }) => history.current.find((e) => e.event === gw))
        .filter(Boolean);

      if (gwEntries.length === 0) continue;

      const scores   = gwEntries.map((e) => e!.points);
      const gwMax    = Math.max(...scores);
      const gwAvg    = scores.reduce((s, v) => s + v, 0) / scores.length;

      for (const entry of gwEntries) {
        benchPtsTotal  += entry!.points_on_bench;
        hitCostTotal   += entry!.event_transfers_cost;
        sufferingTotal += gwMax - entry!.points;
        if (entry!.points < gwAvg) belowAvgGws++;
      }
    }

    // ── Best single-GW bench waste across the whole org ───────────────────────
    let worstBenchGw: { managerName: string; pts: number; gw: number } | null = null;
    for (const { member, history } of histories) {
      for (const entry of history.current) {
        if (entry.event > currentGw) continue;
        if (worstBenchGw === null || entry.points_on_bench > worstBenchGw.pts) {
          worstBenchGw = {
            managerName: member.displayName ?? `Manager ${member.managerId}`,
            pts: entry.points_on_bench,
            gw: entry.event,
          };
        }
      }
    }

    // ── Most expensive single hit ─────────────────────────────────────────────
    let biggestHit: { managerName: string; cost: number; gw: number } | null = null;
    for (const { member, history } of histories) {
      for (const entry of history.current) {
        if (entry.event > currentGw) continue;
        if (entry.event_transfers_cost > 0) {
          if (biggestHit === null || entry.event_transfers_cost > biggestHit.cost) {
            biggestHit = {
              managerName: member.displayName ?? `Manager ${member.managerId}`,
              cost: entry.event_transfers_cost,
              gw: entry.event,
            };
          }
        }
      }
    }

    // ── GW the org collectively scored lowest (most suffering) ────────────────
    let painfulGw: { gw: number; totalSuffering: number } | null = null;
    for (let gw = 1; gw <= currentGw; gw++) {
      const gwEntries = histories
        .map(({ history }) => history.current.find((e) => e.event === gw))
        .filter(Boolean);
      if (gwEntries.length === 0) continue;
      const scores = gwEntries.map((e) => e!.points);
      const gwMax  = Math.max(...scores);
      const gwSuffering = scores.reduce((s, v) => s + (gwMax - v), 0);
      if (painfulGw === null || gwSuffering > painfulGw.totalSuffering) {
        painfulGw = { gw, totalSuffering: gwSuffering };
      }
    }

    return NextResponse.json({
      currentGw,
      managersCount:  org.members.length,
      benchPtsTotal,
      hitCostTotal,
      sufferingTotal,
      belowAvgGws,
      worstBenchGw,
      biggestHit,
      painfulGw,
    });
  } catch (err) {
    console.error("[GET /api/pain-stats]", err);
    return NextResponse.json(
      { error: "Failed to compute pain stats" },
      { status: 500 }
    );
  }
}
