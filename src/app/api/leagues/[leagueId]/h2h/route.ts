import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseQuery, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface H2HGw {
  gw: number;
  ptsA: number;
  ptsB: number;
  winner: "A" | "B" | "draw";
  margin: number;
}

export interface H2HSummary {
  winsA: number;
  winsB: number;
  draws: number;
  netPtsA: number;
  avgMargin: number;
  longestStreakA: number;
  longestStreakB: number;
  currentStreakHolder: "A" | "B" | "draw" | null;
  currentStreak: number;
  biggestWinA: { gw: number; margin: number } | null;
  biggestWinB: { gw: number; margin: number } | null;
}

const querySchema = z
  .object({
    a: z.coerce.number().int().positive(),
    b: z.coerce.number().int().positive(),
  })
  .refine((q) => q.a !== q.b, { message: "Manager IDs must differ" });

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);
    const { a: idA, b: idB } = parseQuery(req, querySchema);

    const memberA = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: league.id, managerId: idA } },
    });
    const memberB = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: league.id, managerId: idB } },
    });
    if (!memberA || !memberB || !memberA.isActive || !memberB.isActive) {
      return fail("One or both managers are not active members of this league", 404);
    }

    let bootstrap, histA, histB;
    try {
      [bootstrap, histA, histB] = await Promise.all([
        fetchBootstrap(),
        fetchEntryHistory(idA),
        fetchEntryHistory(idB),
      ]);
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);

    const dedA = memberA.pointsDeductionPerGw;
    const dedB = memberB.pointsDeductionPerGw;

    const gws: H2HGw[] = [];
    for (let gw = 1; gw <= currentGw; gw++) {
      const entA = histA.current.find((e) => e.event === gw);
      const entB = histB.current.find((e) => e.event === gw);
      if (!entA || !entB) continue;
      const ptsA = entA.points - dedA;
      const ptsB = entB.points - dedB;
      const margin = Math.abs(ptsA - ptsB);
      const winner: H2HGw["winner"] = ptsA > ptsB ? "A" : ptsB > ptsA ? "B" : "draw";
      gws.push({ gw, ptsA, ptsB, winner, margin });
    }
    if (gws.length === 0) return fail("No shared gameweeks found", 404);

    const winsA = gws.filter((g) => g.winner === "A").length;
    const winsB = gws.filter((g) => g.winner === "B").length;
    const draws = gws.filter((g) => g.winner === "draw").length;

    const lastEntA = histA.current.filter((e) => e.event <= currentGw).slice(-1)[0];
    const lastEntB = histB.current.filter((e) => e.event <= currentGw).slice(-1)[0];
    const totalPtsA = (lastEntA?.total_points ?? 0) - dedA * gws.length;
    const totalPtsB = (lastEntB?.total_points ?? 0) - dedB * gws.length;
    const netPtsA = totalPtsA - totalPtsB;

    const avgMargin = Math.round((gws.reduce((s, g) => s + g.margin, 0) / gws.length) * 10) / 10;

    const aWins = gws.filter((g) => g.winner === "A");
    const bWins = gws.filter((g) => g.winner === "B");
    const biggestWinA = aWins.length > 0 ? aWins.reduce((best, g) => (g.margin > best.margin ? g : best)) : null;
    const biggestWinB = bWins.length > 0 ? bWins.reduce((best, g) => (g.margin > best.margin ? g : best)) : null;

    let longestStreakA = 0, longestStreakB = 0, runA = 0, runB = 0;
    for (const g of gws) {
      if (g.winner === "A") { runA++; runB = 0; longestStreakA = Math.max(longestStreakA, runA); }
      else if (g.winner === "B") { runB++; runA = 0; longestStreakB = Math.max(longestStreakB, runB); }
      else { runA = 0; runB = 0; }
    }

    let currentStreak = 0;
    let currentStreakHolder: H2HSummary["currentStreakHolder"] = null;
    for (let i = gws.length - 1; i >= 0; i--) {
      const g = gws[i];
      if (currentStreakHolder === null) {
        if (g.winner === "draw") break;
        currentStreakHolder = g.winner;
        currentStreak = 1;
      } else if (g.winner === currentStreakHolder) {
        currentStreak++;
      } else {
        break;
      }
    }

    const summary: H2HSummary = {
      winsA, winsB, draws, netPtsA, avgMargin,
      longestStreakA, longestStreakB,
      currentStreakHolder, currentStreak,
      biggestWinA: biggestWinA ? { gw: biggestWinA.gw, margin: biggestWinA.margin } : null,
      biggestWinB: biggestWinB ? { gw: biggestWinB.gw, margin: biggestWinB.margin } : null,
    };

    return ok({
      managerA: {
        managerId: idA,
        displayName: memberA.displayName ?? `Manager ${idA}`,
        teamName: memberA.teamName ?? "",
        totalPoints: totalPtsA,
      },
      managerB: {
        managerId: idB,
        displayName: memberB.displayName ?? `Manager ${idB}`,
        teamName: memberB.teamName ?? "",
        totalPoints: totalPtsB,
      },
      gws,
      summary,
      currentGw,
    });
  } catch (err) {
    return failFromError(err);
  }
}
