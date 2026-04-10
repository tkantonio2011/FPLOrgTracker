import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export interface LuckBreakdown {
  /** actual captain pts − org-avg captain pts across all GWs */
  captainLuck: number;
  /** org-avg bench pts − my bench pts across all GWs (positive = lucky, fewer pts left on bench) */
  benchLuck: number;
  /** my total auto-sub pts − org-avg auto-sub pts (positive = lucky auto-subs) */
  autoSubLuck: number;
  totalLuck: number;
  // raw stats for display
  captainTotal: number;      // actual captain pts scored
  orgAvgCaptainTotal: number;
  benchTotal: number;        // pts left on bench
  orgAvgBenchTotal: number;
  autoSubPts: number;        // pts gained from auto-subs
  orgAvgAutoSubPts: number;
  captainBlanks: number;     // GWs where captain scored ≤ 2
  captainHauls: number;      // GWs where captain scored ≥ 15
}

export interface LuckManager {
  managerId: number;
  displayName: string;
  teamName: string;
  breakdown: LuckBreakdown;
  rank: number;           // 1 = luckiest
}

export async function GET() {
  try {
    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org || org.members.length === 0) {
      return NextResponse.json(
        { error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" },
        { status: 404 }
      );
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);

    // All histories in parallel
    const histories = await Promise.all(
      org.members.map(async (m) => ({
        member: m,
        history: await fetchEntryHistory(m.managerId),
      }))
    );

    const playedGws = Array.from(
      new Set(
        histories.flatMap(({ history }) =>
          history.current.map((e) => e.event).filter((gw) => gw <= currentGw)
        )
      )
    ).sort((a, b) => a - b);

    // Live data for all played GWs
    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      playedGws.map(async (gw) => {
        const live = await fetchLiveGw(gw);
        liveByGw.set(gw, new Map(live.elements.map((el) => [el.id, el.stats.total_points])));
      })
    );

    // All picks for all managers × all played GWs
    type PicksResult = {
      managerId: number;
      gw: number;
      captainId: number | null;
      autoSubs: { elementIn: number; elementOut: number }[];
    };

    const picksResults: PicksResult[] = (
      await Promise.all(
        histories.flatMap(({ member }) =>
          playedGws.map(async (gw): Promise<PicksResult> => {
            try {
              const picks = await fetchEntryPicks(member.managerId, gw);
              const captain = picks.picks.find((p) => p.is_captain);
              const autoSubs = (picks.automatic_subs ?? []).map((s) => ({
                elementIn: s.element_in,
                elementOut: s.element_out,
              }));
              return { managerId: member.managerId, gw, captainId: captain?.element ?? null, autoSubs };
            } catch {
              return { managerId: member.managerId, gw, captainId: null, autoSubs: [] };
            }
          })
        )
      )
    );

    // Per-GW: org-average captain pts and bench pts
    const orgCaptainAvgByGw = new Map<number, number>();
    const orgBenchAvgByGw   = new Map<number, number>();

    for (const gw of playedGws) {
      // Captain avg
      const gwPicks = picksResults.filter((p) => p.gw === gw && p.captainId !== null);
      const captainScores = gwPicks
        .map((p) => liveByGw.get(gw)?.get(p.captainId!) ?? 0);
      if (captainScores.length > 0) {
        orgCaptainAvgByGw.set(gw, captainScores.reduce((s, v) => s + v, 0) / captainScores.length);
      }

      // Bench avg
      const benchScores = histories
        .map(({ member, history }) => {
          const e = history.current.find((h) => h.event === gw);
          return e ? e.points_on_bench - (member.pointsDeductionPerGw ?? 0) : null;
        })
        .filter((s): s is number => s !== null);
      if (benchScores.length > 0) {
        orgBenchAvgByGw.set(gw, benchScores.reduce((s, v) => s + v, 0) / benchScores.length);
      }
    }

    // Org-wide average auto-sub pts per manager
    const autoSubPtsAllManagers: number[] = [];
    for (const { member } of histories) {
      const myPicks = picksResults.filter((p) => p.managerId === member.managerId);
      let pts = 0;
      for (const { gw, autoSubs } of myPicks) {
        const gwLive = liveByGw.get(gw);
        for (const sub of autoSubs) {
          pts += gwLive?.get(sub.elementIn) ?? 0;
        }
      }
      autoSubPtsAllManagers.push(pts);
    }
    const orgAvgAutoSubPts =
      autoSubPtsAllManagers.length > 0
        ? autoSubPtsAllManagers.reduce((s, v) => s + v, 0) / autoSubPtsAllManagers.length
        : 0;

    // Build per-manager luck
    const managers: LuckManager[] = histories.map(({ member, history }) => {
      const deduction = member.pointsDeductionPerGw ?? 0;
      const myPicks = picksResults.filter((p) => p.managerId === member.managerId);

      let captainLuck = 0;
      let captainTotal = 0;
      let orgAvgCaptainTotal = 0;
      let captainBlanks = 0;
      let captainHauls = 0;

      let benchLuck = 0;
      let benchTotal = 0;
      let orgAvgBenchTotal = 0;

      let autoSubPts = 0;

      for (const gw of playedGws) {
        const histEntry = history.current.find((e) => e.event === gw);
        const gwLive    = liveByGw.get(gw);
        const gwPicks   = myPicks.find((p) => p.gw === gw);
        const orgCapAvg = orgCaptainAvgByGw.get(gw) ?? 0;
        const orgBnAvg  = orgBenchAvgByGw.get(gw)   ?? 0;

        // Captain luck
        if (gwPicks?.captainId) {
          const captainPts = gwLive?.get(gwPicks.captainId) ?? 0;
          captainTotal    += captainPts;
          captainLuck     += captainPts - orgCapAvg;
          orgAvgCaptainTotal += orgCapAvg;
          if (captainPts <= 2) captainBlanks++;
          if (captainPts >= 15) captainHauls++;
        }

        // Bench luck
        if (histEntry) {
          const myBench = histEntry.points_on_bench - deduction;
          benchTotal         += myBench;
          benchLuck          += orgBnAvg - myBench; // positive = lucky (less on bench than avg)
          orgAvgBenchTotal   += orgBnAvg;
        }

        // Auto-sub pts
        if (gwPicks) {
          for (const sub of gwPicks.autoSubs) {
            autoSubPts += gwLive?.get(sub.elementIn) ?? 0;
          }
        }
      }

      const autoSubLuck = Math.round(autoSubPts - orgAvgAutoSubPts);

      const breakdown: LuckBreakdown = {
        captainLuck:          Math.round(captainLuck),
        benchLuck:            Math.round(benchLuck),
        autoSubLuck,
        totalLuck:            Math.round(captainLuck + benchLuck + autoSubLuck),
        captainTotal:         Math.round(captainTotal),
        orgAvgCaptainTotal:   Math.round(orgAvgCaptainTotal),
        benchTotal:           Math.round(benchTotal),
        orgAvgBenchTotal:     Math.round(orgAvgBenchTotal),
        autoSubPts:           Math.round(autoSubPts),
        orgAvgAutoSubPts:     Math.round(orgAvgAutoSubPts),
        captainBlanks,
        captainHauls,
      };

      return {
        managerId: member.managerId,
        displayName: member.displayName ?? `Manager ${member.managerId}`,
        teamName: member.teamName ?? "",
        breakdown,
        rank: 0,
      };
    });

    // Sort luckiest first
    managers.sort((a, b) => b.breakdown.totalLuck - a.breakdown.totalLuck);
    managers.forEach((m, i) => { m.rank = i + 1; });

    return NextResponse.json({ managers, currentGw });
  } catch (err) {
    console.error("[GET /api/luck]", err);
    return NextResponse.json(
      { error: "Failed to compute luck index", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
