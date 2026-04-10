import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export interface H2HGw {
  gw: number;
  ptsA: number;
  ptsB: number;
  /** "A" | "B" | "draw" */
  winner: "A" | "B" | "draw";
  margin: number; // absolute, always ≥ 0
}

export interface H2HSummary {
  winsA: number;
  winsB: number;
  draws: number;
  /** A total pts minus B total pts across all played GWs */
  netPtsA: number;
  avgMargin: number; // average of |ptsA - ptsB| per GW
  longestStreakA: number;
  longestStreakB: number;
  currentStreakHolder: "A" | "B" | "draw" | null;
  currentStreak: number;
  biggestWinA: { gw: number; margin: number } | null;
  biggestWinB: { gw: number; margin: number } | null;
}

export interface H2HResponse {
  managerA: { managerId: number; displayName: string; teamName: string; totalPoints: number };
  managerB: { managerId: number; displayName: string; teamName: string; totalPoints: number };
  gws: H2HGw[];
  summary: H2HSummary;
  currentGw: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const aParam = searchParams.get("a");
    const bParam = searchParams.get("b");

    if (!aParam || !bParam) {
      return NextResponse.json(
        { error: "Missing manager IDs — provide ?a=<id>&b=<id>", code: "MISSING_PARAMS" },
        { status: 400 }
      );
    }

    const idA = parseInt(aParam);
    const idB = parseInt(bParam);

    if (isNaN(idA) || isNaN(idB) || idA === idB) {
      return NextResponse.json(
        { error: "Invalid manager IDs", code: "INVALID_PARAMS" },
        { status: 400 }
      );
    }

    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" },
        { status: 404 }
      );
    }

    const memberA = org.members.find((m) => m.managerId === idA);
    const memberB = org.members.find((m) => m.managerId === idB);
    if (!memberA || !memberB) {
      return NextResponse.json(
        { error: "One or both managers not found in org", code: "MANAGER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);

    const [histA, histB] = await Promise.all([
      fetchEntryHistory(idA),
      fetchEntryHistory(idB),
    ]);

    const dedA = memberA.pointsDeductionPerGw ?? 0;
    const dedB = memberB.pointsDeductionPerGw ?? 0;

    // Build GW-by-GW comparison for all played GWs
    const gws: H2HGw[] = [];
    for (let gw = 1; gw <= currentGw; gw++) {
      const entA = histA.current.find((e) => e.event === gw);
      const entB = histB.current.find((e) => e.event === gw);
      if (!entA || !entB) continue;

      const ptsA = entA.points - dedA;
      const ptsB = entB.points - dedB;
      const margin = Math.abs(ptsA - ptsB);
      const winner: H2HGw["winner"] =
        ptsA > ptsB ? "A" : ptsB > ptsA ? "B" : "draw";

      gws.push({ gw, ptsA, ptsB, winner, margin });
    }

    if (gws.length === 0) {
      return NextResponse.json(
        { error: "No shared gameweeks found", code: "NO_DATA" },
        { status: 404 }
      );
    }

    // ── Summary stats ─────────────────────────────────────────────────────────
    const winsA = gws.filter((g) => g.winner === "A").length;
    const winsB = gws.filter((g) => g.winner === "B").length;
    const draws = gws.filter((g) => g.winner === "draw").length;

    const lastEntA = histA.current.filter((e) => e.event <= currentGw).slice(-1)[0];
    const lastEntB = histB.current.filter((e) => e.event <= currentGw).slice(-1)[0];
    const totalPtsA = (lastEntA?.total_points ?? 0) - dedA * gws.length;
    const totalPtsB = (lastEntB?.total_points ?? 0) - dedB * gws.length;
    const netPtsA = totalPtsA - totalPtsB;

    const avgMargin =
      Math.round(
        (gws.reduce((s, g) => s + g.margin, 0) / gws.length) * 10
      ) / 10;

    // Biggest wins
    const aWins = gws.filter((g) => g.winner === "A");
    const bWins = gws.filter((g) => g.winner === "B");
    const biggestWinA =
      aWins.length > 0
        ? aWins.reduce((best, g) => (g.margin > best.margin ? g : best))
        : null;
    const biggestWinB =
      bWins.length > 0
        ? bWins.reduce((best, g) => (g.margin > best.margin ? g : best))
        : null;

    // Longest win streaks
    let longestStreakA = 0, longestStreakB = 0;
    let runA = 0, runB = 0;
    for (const g of gws) {
      if (g.winner === "A") { runA++; runB = 0; longestStreakA = Math.max(longestStreakA, runA); }
      else if (g.winner === "B") { runB++; runA = 0; longestStreakB = Math.max(longestStreakB, runB); }
      else { runA = 0; runB = 0; }
    }

    // Current streak (from the most recent GW backwards)
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
      winsA,
      winsB,
      draws,
      netPtsA,
      avgMargin,
      longestStreakA,
      longestStreakB,
      currentStreakHolder,
      currentStreak,
      biggestWinA: biggestWinA ? { gw: biggestWinA.gw, margin: biggestWinA.margin } : null,
      biggestWinB: biggestWinB ? { gw: biggestWinB.gw, margin: biggestWinB.margin } : null,
    };

    const response: H2HResponse = {
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
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/h2h]", err);
    return NextResponse.json(
      { error: "Failed to compute H2H data", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
