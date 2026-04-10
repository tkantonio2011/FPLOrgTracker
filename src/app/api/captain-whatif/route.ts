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

export interface WhatIfGw {
  gw: number;
  actualCaptain: { id: number; name: string; pts: number };
  bestOwned:     { id: number; name: string; pts: number }; // best in YOUR 15
  orgBest:       { id: number; name: string; pts: number; managerName: string } | null;
  /** bestOwned.pts − actualCaptain.pts  (0 when optimal, raw before ×2) */
  missedPts: number;
  /** actual pts impact on total score = missedPts × 2 */
  actualImpact: number;
  isOptimal: boolean;
}

export interface WhatIfManager {
  managerId: number;
  displayName: string;
  teamName: string;
  gws: WhatIfGw[];
  totalMissedPts: number;     // sum of missedPts (raw)
  totalActualImpact: number;  // sum of actualImpact (what it really cost)
  optimalPicks: number;       // GWs where captain was best available
  biggestMiss: WhatIfGw | null;
  bestDecision: WhatIfGw | null; // GW where they DID get the best (highest pts)
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
    const playerName = new Map(bootstrap.elements.map((e) => [e.id, e.web_name]));

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

    // Live pts for all played GWs
    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      playedGws.map(async (gw) => {
        const live = await fetchLiveGw(gw);
        liveByGw.set(gw, new Map(live.elements.map((el) => [el.id, el.stats.total_points])));
      })
    );

    // All picks: managerId → gw → { captainId, squadIds }
    type PickData = { captainId: number | null; squadIds: number[] };
    const allPicks = new Map<number, Map<number, PickData>>();
    for (const { member } of histories) allPicks.set(member.managerId, new Map());

    await Promise.all(
      histories.flatMap(({ member }) =>
        playedGws.map(async (gw) => {
          try {
            const picks = await fetchEntryPicks(member.managerId, gw);
            const captainPick = picks.picks.find((p) => p.is_captain);
            allPicks.get(member.managerId)!.set(gw, {
              captainId: captainPick?.element ?? null,
              squadIds: picks.picks.map((p) => p.element),
            });
          } catch {
            allPicks.get(member.managerId)!.set(gw, { captainId: null, squadIds: [] });
          }
        })
      )
    );

    // Per-GW: find the best actual captain across the whole org (highest captain pts)
    const orgBestCaptainByGw = new Map<
      number,
      { id: number; name: string; pts: number; managerName: string }
    >();
    for (const gw of playedGws) {
      const gwLive = liveByGw.get(gw);
      let best: typeof orgBestCaptainByGw extends Map<number, infer V> ? V : never =
        { id: 0, name: "", pts: -1, managerName: "" };

      for (const { member } of histories) {
        const picks = allPicks.get(member.managerId)?.get(gw);
        if (!picks?.captainId) continue;
        const pts = gwLive?.get(picks.captainId) ?? 0;
        if (pts > best.pts) {
          best = {
            id: picks.captainId,
            name: playerName.get(picks.captainId) ?? `#${picks.captainId}`,
            pts,
            managerName: (member.displayName ?? "").split(" ")[0],
          };
        }
      }
      if (best.pts >= 0) orgBestCaptainByGw.set(gw, best);
    }

    // Build per-manager what-if data
    const managers: WhatIfManager[] = histories.map(({ member }) => {
      const gwLive     = allPicks.get(member.managerId)!;
      const gws: WhatIfGw[] = [];

      for (const gw of playedGws) {
        const picks  = gwLive.get(gw);
        if (!picks?.captainId || picks.squadIds.length === 0) continue;

        const live = liveByGw.get(gw);
        const captainPts = live?.get(picks.captainId) ?? 0;

        // Best player in their own 15
        let bestId  = picks.captainId;
        let bestPts = captainPts;
        for (const pid of picks.squadIds) {
          const p = live?.get(pid) ?? 0;
          if (p > bestPts) { bestPts = p; bestId = pid; }
        }

        const missedPts    = bestPts - captainPts;
        const actualImpact = missedPts * 2;
        const isOptimal    = missedPts === 0;

        gws.push({
          gw,
          actualCaptain: {
            id:   picks.captainId,
            name: playerName.get(picks.captainId) ?? `#${picks.captainId}`,
            pts:  captainPts,
          },
          bestOwned: {
            id:   bestId,
            name: playerName.get(bestId) ?? `#${bestId}`,
            pts:  bestPts,
          },
          orgBest: orgBestCaptainByGw.get(gw) ?? null,
          missedPts,
          actualImpact,
          isOptimal,
        });
      }

      gws.sort((a, b) => b.gw - a.gw); // newest first

      const totalMissedPts    = gws.reduce((s, g) => s + g.missedPts, 0);
      const totalActualImpact = gws.reduce((s, g) => s + g.actualImpact, 0);
      const optimalPicks      = gws.filter((g) => g.isOptimal).length;
      const biggestMiss       = gws.filter((g) => !g.isOptimal).sort((a, b) => b.missedPts - a.missedPts)[0] ?? null;
      const bestDecision      = gws.filter((g) => g.isOptimal && g.actualCaptain.pts > 0)
        .sort((a, b) => b.actualCaptain.pts - a.actualCaptain.pts)[0] ?? null;

      return {
        managerId:        member.managerId,
        displayName:      member.displayName ?? `Manager ${member.managerId}`,
        teamName:         member.teamName ?? "",
        gws,
        totalMissedPts,
        totalActualImpact,
        optimalPicks,
        biggestMiss,
        bestDecision,
      };
    });

    // Sort by totalMissedPts ascending (best captain picker first)
    managers.sort((a, b) => a.totalMissedPts - b.totalMissedPts);

    return NextResponse.json({ managers, currentGw });
  } catch (err) {
    console.error("[GET /api/captain-whatif]", err);
    return NextResponse.json(
      { error: "Failed to compute captain what-if", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
