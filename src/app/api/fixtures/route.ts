import { NextRequest, NextResponse } from "next/server";
import { fetchBootstrap, fetchFixtures } from "@/lib/fpl/client";
import type { FplFixture } from "@/lib/fpl/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const gwParam = searchParams.get("gw");
    const gw = gwParam ? parseInt(gwParam, 10) : undefined;

    const [bootstrap, fixtures] = await Promise.all([
      fetchBootstrap(),
      fetchFixtures(gw),
    ]);

    const teamShortNames = new Map<number, string>(
      bootstrap.teams.map((t) => [t.id, t.short_name])
    );

    // Detect DGW: count how many fixtures per team per event
    const teamEventCount = new Map<string, number>();
    for (const f of fixtures) {
      if (f.event === null) continue;
      const keyH = `${f.team_h}-${f.event}`;
      const keyA = `${f.team_a}-${f.event}`;
      teamEventCount.set(keyH, (teamEventCount.get(keyH) ?? 0) + 1);
      teamEventCount.set(keyA, (teamEventCount.get(keyA) ?? 0) + 1);
    }

    const result = fixtures.map((f: FplFixture) => {
      const isDgwForTeamH =
        f.event !== null
          ? (teamEventCount.get(`${f.team_h}-${f.event}`) ?? 0) >= 2
          : false;
      const isDgwForTeamA =
        f.event !== null
          ? (teamEventCount.get(`${f.team_a}-${f.event}`) ?? 0) >= 2
          : false;

      return {
        id: f.id,
        gameweekId: f.event,
        teamH: {
          id: f.team_h,
          shortName: teamShortNames.get(f.team_h) ?? String(f.team_h),
        },
        teamA: {
          id: f.team_a,
          shortName: teamShortNames.get(f.team_a) ?? String(f.team_a),
        },
        teamHDifficulty: f.team_h_difficulty,
        teamADifficulty: f.team_a_difficulty,
        teamHScore: f.team_h_score,
        teamAScore: f.team_a_score,
        kickoffTime: f.kickoff_time,
        finished: f.finished,
        isDgwForTeamH,
        isDgwForTeamA,
      };
    });

    return NextResponse.json({ fixtures: result });
  } catch (err) {
    console.error("[GET /api/fixtures]", err);
    return NextResponse.json(
      { error: "Failed to fetch fixtures", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
