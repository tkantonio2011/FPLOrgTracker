import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORM_WINDOW = 3;

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length === 0) {
      return ok({
        managers: [],
        formWindow: FORM_WINDOW,
        formGws: [],
        gwAverages: [],
        currentGw: 0,
      });
    }

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);
    const finishedGws = bootstrap.events.filter((e) => e.finished).map((e) => e.id);

    const lastN = finishedGws.slice(-FORM_WINDOW);

    const results = await Promise.allSettled(
      memberships.map(async (m) => {
        const history = await fetchEntryHistory(m.managerId);
        const deduction = m.pointsDeductionPerGw;

        const formGws = lastN.map((gw) => {
          const entry = history.current.find((e) => e.event === gw);
          return {
            gw,
            pts: entry ? entry.points - deduction : null,
          };
        });

        const formTotal = formGws.reduce((s, g) => s + (g.pts ?? 0), 0);

        const played = history.current.filter((e) => e.event <= currentGw);
        const overallTotal =
          played.length > 0
            ? played[played.length - 1].total_points - deduction * played.length
            : 0;

        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          teamName: m.teamName ?? "",
          formGws,
          formTotal,
          overallTotal,
          gwsPlayed: played.length,
        };
      }),
    );

    const managers = results
      .filter(
        (r): r is PromiseFulfilledResult<{
          managerId: number;
          displayName: string;
          teamName: string;
          formGws: { gw: number; pts: number | null }[];
          formTotal: number;
          overallTotal: number;
          gwsPlayed: number;
        }> => r.status === "fulfilled",
      )
      .map((r) => r.value);

    const formRanked = [...managers]
      .sort((a, b) => b.formTotal - a.formTotal)
      .map((m, i) => ({ ...m, formRank: i + 1 }));

    const overallOrder = [...managers]
      .sort((a, b) => b.overallTotal - a.overallTotal)
      .map((m, i) => ({ managerId: m.managerId, overallRank: i + 1 }));
    const overallRankMap = new Map(overallOrder.map((m) => [m.managerId, m.overallRank]));

    const output = formRanked.map((m) => ({
      ...m,
      overallRank: overallRankMap.get(m.managerId) ?? 0,
      formVsOverall: (overallRankMap.get(m.managerId) ?? 0) - m.formRank,
    }));

    const gwAverages = lastN.map((gw) => {
      const scores = managers
        .map((m) => m.formGws.find((g) => g.gw === gw)?.pts)
        .filter((p): p is number => p !== null && p !== undefined);
      return {
        gw,
        avg:
          scores.length > 0
            ? Math.round(scores.reduce((s, p) => s + p, 0) / scores.length)
            : 0,
      };
    });

    return ok({
      managers: output,
      formWindow: FORM_WINDOW,
      formGws: lastN,
      gwAverages,
      currentGw,
    });
  } catch (err) {
    return failFromError(err);
  }
}
