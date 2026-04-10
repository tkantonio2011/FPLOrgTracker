import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

const FORM_WINDOW = 3; // number of GWs to consider

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
    // Only count GWs that are fully finished (not the live current GW)
    const finishedGws = bootstrap.events
      .filter((e) => e.finished)
      .map((e) => e.id);

    const lastN = finishedGws.slice(-FORM_WINDOW);

    const results = await Promise.allSettled(
      org.members.map(async (m) => {
        const history = await fetchEntryHistory(m.managerId);
        const deduction = m.pointsDeductionPerGw ?? 0;

        // GW scores for form window (handle missing GWs gracefully)
        const formGws = lastN.map((gw) => {
          const entry = history.current.find((e) => e.event === gw);
          return {
            gw,
            pts: entry ? entry.points - deduction : null,
          };
        });

        const formTotal = formGws.reduce((s, g) => s + (g.pts ?? 0), 0);

        // Overall total (apply deduction for all played GWs)
        const played = history.current.filter((e) => e.event <= currentGw);
        const overallTotal = played.length > 0
          ? (played[played.length - 1].total_points) - deduction * played.length
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
      })
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
        }> => r.status === "fulfilled"
      )
      .map((r) => r.value);

    // Assign form rank (by form total desc)
    const formRanked = [...managers]
      .sort((a, b) => b.formTotal - a.formTotal)
      .map((m, i) => ({ ...m, formRank: i + 1 }));

    // Assign overall rank (by overall total desc)
    const overallOrder = [...managers]
      .sort((a, b) => b.overallTotal - a.overallTotal)
      .map((m, i) => ({ managerId: m.managerId, overallRank: i + 1 }));
    const overallRankMap = new Map(overallOrder.map((m) => [m.managerId, m.overallRank]));

    const output = formRanked.map((m) => ({
      ...m,
      overallRank: overallRankMap.get(m.managerId) ?? 0,
      // positive = climbing in form vs overall, negative = dropping
      formVsOverall: (overallRankMap.get(m.managerId) ?? 0) - m.formRank,
    }));

    // Per-GW org average for context
    const gwAverages = lastN.map((gw) => {
      const scores = managers
        .map((m) => m.formGws.find((g) => g.gw === gw)?.pts)
        .filter((p): p is number => p !== null);
      return {
        gw,
        avg: scores.length > 0 ? Math.round(scores.reduce((s, p) => s + p, 0) / scores.length) : 0,
      };
    });

    return NextResponse.json({
      managers: output,
      formWindow: FORM_WINDOW,
      formGws: lastN,
      gwAverages,
      currentGw,
    });
  } catch (err) {
    console.error("[GET /api/form]", err);
    return NextResponse.json(
      { error: "Failed to fetch form data", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
