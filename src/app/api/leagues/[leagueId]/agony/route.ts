import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface AgonyBreakdown {
  benchPts: number;
  captainPain: number;
  hitCost: number;
  gwSuffering: number;
  totalAgony: number;
}

export interface AgonyManager {
  managerId: number;
  displayName: string;
  teamName: string;
  breakdown: AgonyBreakdown;
  rank: number;
  captainBlanks: number;
  worstGw: { gw: number; pts: number; orgWinner: number } | null;
}

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length === 0) return ok({ managers: [], currentGw: 0 });

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);

    const histories = await Promise.all(
      memberships.map(async (m) => ({
        member: m,
        history: await fetchEntryHistory(m.managerId),
      })),
    );

    const playedGws = Array.from(
      new Set(histories.flatMap(({ history }) => history.current.map((e) => e.event))),
    )
      .filter((gw) => gw <= currentGw)
      .sort((a, b) => a - b);

    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      playedGws.map(async (gw) => {
        const live = await fetchLiveGw(gw);
        liveByGw.set(gw, new Map(live.elements.map((el) => [el.id, el.stats.total_points])));
      }),
    );

    const orgGwWinner = new Map<number, number>();
    for (const gw of playedGws) {
      const scores = histories
        .map(({ member, history }) => {
          const e = history.current.find((h) => h.event === gw);
          return e ? e.points - member.pointsDeductionPerGw : null;
        })
        .filter((s): s is number => s !== null);
      if (scores.length > 0) orgGwWinner.set(gw, Math.max(...scores));
    }

    type PicksKey = `${number}-${number}`;
    const picksMap = new Map<PicksKey, number>();
    await Promise.all(
      histories.flatMap(({ member }) =>
        playedGws.map(async (gw) => {
          try {
            const picks = await fetchEntryPicks(member.managerId, gw);
            const captain = picks.picks.find((p) => p.is_captain);
            if (captain) picksMap.set(`${member.managerId}-${gw}`, captain.element);
          } catch {
            // private team
          }
        }),
      ),
    );

    const managers: AgonyManager[] = histories.map(({ member, history }) => {
      const deduction = member.pointsDeductionPerGw;
      let benchPts = 0,
        captainPain = 0,
        captainBlanks = 0,
        hitCost = 0,
        gwSuffering = 0;
      let worstGwEntry: { gw: number; pts: number; orgWinner: number } | null = null;
      let worstSuffering = -1;

      for (const e of history.current.filter((h) => h.event <= currentGw)) {
        const gw = e.event;
        const myPts = e.points - deduction;
        const gwWinner = orgGwWinner.get(gw) ?? myPts;
        const suffering = Math.max(0, gwWinner - myPts);

        benchPts += e.points_on_bench;
        hitCost += e.event_transfers_cost;
        gwSuffering += suffering;

        if (suffering > worstSuffering) {
          worstSuffering = suffering;
          worstGwEntry = { gw, pts: myPts, orgWinner: gwWinner };
        }

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

    managers.sort((a, b) => b.breakdown.totalAgony - a.breakdown.totalAgony);
    managers.forEach((m, i) => {
      m.rank = i + 1;
    });

    return ok({ managers, currentGw });
  } catch (err) {
    return failFromError(err);
  }
}
