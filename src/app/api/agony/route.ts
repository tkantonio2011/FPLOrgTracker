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

export interface AgonyBreakdown {
  benchPts: number;          // pts left on bench all season
  captainPain: number;       // sum of (captainPts × 2) for GWs where captain scored ≤ 2
  hitCost: number;           // total transfer hit pts paid
  gwSuffering: number;       // sum of (orgGwWinner − myPts) across all GWs
  totalAgony: number;
}

export interface AgonyManager {
  managerId: number;
  displayName: string;
  teamName: string;
  breakdown: AgonyBreakdown;
  rank: number;
  // For flavour text
  captainBlanks: number;     // count of GWs where captain scored ≤ 2
  worstGw: { gw: number; pts: number; orgWinner: number } | null;
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

    // Fetch all histories in parallel
    const histories = await Promise.all(
      org.members.map(async (m) => ({
        member: m,
        history: await fetchEntryHistory(m.managerId),
      }))
    );

    const playedGws = Array.from(
      new Set(histories.flatMap(({ history }) => history.current.map((e) => e.event)))
    )
      .filter((gw) => gw <= currentGw)
      .sort((a, b) => a - b);

    // Fetch live data for all played GWs in parallel (cached)
    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      playedGws.map(async (gw) => {
        const live = await fetchLiveGw(gw);
        liveByGw.set(gw, new Map(live.elements.map((el) => [el.id, el.stats.total_points])));
      })
    );

    // Per-GW: find the org winner score
    const orgGwWinner = new Map<number, number>();
    for (const gw of playedGws) {
      const scores = histories
        .map(({ member, history }) => {
          const e = history.current.find((h) => h.event === gw);
          return e ? e.points - (member.pointsDeductionPerGw ?? 0) : null;
        })
        .filter((s): s is number => s !== null);
      if (scores.length > 0) orgGwWinner.set(gw, Math.max(...scores));
    }

    // Fetch all picks in parallel across all managers × all played GWs
    // (these are already cached by the captain-history page visits)
    type PicksKey = `${number}-${number}`;
    const picksMap = new Map<PicksKey, number>(); // managerId-gw → captainElementId

    await Promise.all(
      histories.flatMap(({ member }) =>
        playedGws.map(async (gw) => {
          try {
            const picks = await fetchEntryPicks(member.managerId, gw);
            const captain = picks.picks.find((p) => p.is_captain);
            if (captain) {
              picksMap.set(`${member.managerId}-${gw}`, captain.element);
            }
          } catch {
            // Private team or missing picks — skip
          }
        })
      )
    );

    // Build agony per manager
    const managers: AgonyManager[] = histories.map(({ member, history }) => {
      const deduction = member.pointsDeductionPerGw ?? 0;
      let benchPts = 0;
      let captainPain = 0;
      let captainBlanks = 0;
      let hitCost = 0;
      let gwSuffering = 0;
      let worstGwEntry: { gw: number; pts: number; orgWinner: number } | null = null;
      let worstSuffering = -1;

      for (const e of history.current.filter((h) => h.event <= currentGw)) {
        const gw = e.event;
        const myPts = e.points - deduction;
        const gwWinner = orgGwWinner.get(gw) ?? myPts;
        const suffering = Math.max(0, gwWinner - myPts);

        benchPts += e.points_on_bench;
        hitCost  += e.event_transfers_cost;
        gwSuffering += suffering;

        if (suffering > worstSuffering) {
          worstSuffering = suffering;
          worstGwEntry = { gw, pts: myPts, orgWinner: gwWinner };
        }

        // Captain pain
        const captainId = picksMap.get(`${member.managerId}-${gw}`);
        if (captainId !== undefined) {
          const captainPts = liveByGw.get(gw)?.get(captainId) ?? 0;
          if (captainPts <= 2) {
            captainPain += captainPts * 2;
            captainBlanks++;
          }
        }
      }

      const totalAgony = benchPts + captainPain + hitCost + gwSuffering;

      return {
        managerId: member.managerId,
        displayName: member.displayName ?? `Manager ${member.managerId}`,
        teamName: member.teamName ?? "",
        breakdown: { benchPts, captainPain, hitCost, gwSuffering, totalAgony },
        rank: 0,
        captainBlanks,
        worstGw: worstGwEntry,
      };
    });

    // Sort highest agony first and assign rank
    managers.sort((a, b) => b.breakdown.totalAgony - a.breakdown.totalAgony);
    managers.forEach((m, i) => { m.rank = i + 1; });

    return NextResponse.json({ managers, currentGw });
  } catch (err) {
    console.error("[GET /api/agony]", err);
    return NextResponse.json(
      { error: "Failed to compute agony index", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
