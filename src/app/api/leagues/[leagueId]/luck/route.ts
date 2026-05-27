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

export interface LuckBreakdown {
  captainLuck: number;
  benchLuck: number;
  autoSubLuck: number;
  totalLuck: number;
  captainTotal: number;
  leagueAvgCaptainTotal: number;
  benchTotal: number;
  leagueAvgBenchTotal: number;
  autoSubPts: number;
  leagueAvgAutoSubPts: number;
  captainBlanks: number;
  captainHauls: number;
}

export interface LuckManager {
  managerId: number;
  displayName: string;
  teamName: string;
  breakdown: LuckBreakdown;
  rank: number;
}

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
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
      new Set(
        histories.flatMap(({ history }) =>
          history.current.map((e) => e.event).filter((gw) => gw <= currentGw),
        ),
      ),
    ).sort((a, b) => a - b);

    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      playedGws.map(async (gw) => {
        const live = await fetchLiveGw(gw);
        liveByGw.set(gw, new Map(live.elements.map((el) => [el.id, el.stats.total_points])));
      }),
    );

    type PicksResult = {
      managerId: number;
      gw: number;
      captainId: number | null;
      autoSubs: { elementIn: number; elementOut: number }[];
    };

    const picksResults: PicksResult[] = await Promise.all(
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
        }),
      ),
    );

    const leagueCaptainAvgByGw = new Map<number, number>();
    const leagueBenchAvgByGw = new Map<number, number>();

    for (const gw of playedGws) {
      const gwPicks = picksResults.filter((p) => p.gw === gw && p.captainId !== null);
      const captainScores = gwPicks.map((p) => liveByGw.get(gw)?.get(p.captainId!) ?? 0);
      if (captainScores.length > 0) {
        leagueCaptainAvgByGw.set(
          gw,
          captainScores.reduce((s, v) => s + v, 0) / captainScores.length,
        );
      }

      const benchScores = histories
        .map(({ member, history }) => {
          const e = history.current.find((h) => h.event === gw);
          return e ? e.points_on_bench - member.pointsDeductionPerGw : null;
        })
        .filter((s): s is number => s !== null);
      if (benchScores.length > 0) {
        leagueBenchAvgByGw.set(
          gw,
          benchScores.reduce((s, v) => s + v, 0) / benchScores.length,
        );
      }
    }

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
    const leagueAvgAutoSubPts =
      autoSubPtsAllManagers.length > 0
        ? autoSubPtsAllManagers.reduce((s, v) => s + v, 0) / autoSubPtsAllManagers.length
        : 0;

    const managers: LuckManager[] = histories.map(({ member, history }) => {
      const deduction = member.pointsDeductionPerGw;
      const myPicks = picksResults.filter((p) => p.managerId === member.managerId);

      let captainLuck = 0;
      let captainTotal = 0;
      let leagueAvgCaptainTotal = 0;
      let captainBlanks = 0;
      let captainHauls = 0;

      let benchLuck = 0;
      let benchTotal = 0;
      let leagueAvgBenchTotal = 0;

      let autoSubPts = 0;

      for (const gw of playedGws) {
        const histEntry = history.current.find((e) => e.event === gw);
        const gwLive = liveByGw.get(gw);
        const gwPicks = myPicks.find((p) => p.gw === gw);
        const leagueCapAvg = leagueCaptainAvgByGw.get(gw) ?? 0;
        const leagueBnAvg = leagueBenchAvgByGw.get(gw) ?? 0;

        if (gwPicks?.captainId) {
          const captainPts = gwLive?.get(gwPicks.captainId) ?? 0;
          captainTotal += captainPts;
          captainLuck += captainPts - leagueCapAvg;
          leagueAvgCaptainTotal += leagueCapAvg;
          if (captainPts <= 2) captainBlanks++;
          if (captainPts >= 15) captainHauls++;
        }

        if (histEntry) {
          const myBench = histEntry.points_on_bench - deduction;
          benchTotal += myBench;
          benchLuck += leagueBnAvg - myBench;
          leagueAvgBenchTotal += leagueBnAvg;
        }

        if (gwPicks) {
          for (const sub of gwPicks.autoSubs) {
            autoSubPts += gwLive?.get(sub.elementIn) ?? 0;
          }
        }
      }

      const autoSubLuck = Math.round(autoSubPts - leagueAvgAutoSubPts);

      const breakdown: LuckBreakdown = {
        captainLuck: Math.round(captainLuck),
        benchLuck: Math.round(benchLuck),
        autoSubLuck,
        totalLuck: Math.round(captainLuck + benchLuck + autoSubLuck),
        captainTotal: Math.round(captainTotal),
        leagueAvgCaptainTotal: Math.round(leagueAvgCaptainTotal),
        benchTotal: Math.round(benchTotal),
        leagueAvgBenchTotal: Math.round(leagueAvgBenchTotal),
        autoSubPts: Math.round(autoSubPts),
        leagueAvgAutoSubPts: Math.round(leagueAvgAutoSubPts),
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

    managers.sort((a, b) => b.breakdown.totalLuck - a.breakdown.totalLuck);
    managers.forEach((m, i) => {
      m.rank = i + 1;
    });

    return ok({ managers, currentGw });
  } catch (err) {
    return failFromError(err);
  }
}
