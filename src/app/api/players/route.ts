import { NextRequest, NextResponse } from "next/server";
import { fetchBootstrap, fetchFixtures } from "@/lib/fpl/client";
import { getCacheTtl, buildCacheHeader } from "@/lib/cache";
import type { FplFixture } from "@/lib/fpl/types";

export const dynamic = "force-dynamic";

interface UpcomingFixture {
  gameweekId: number;
  opponent: string;
  isHome: boolean;
  difficulty: number;
}

function getNextFixtures(
  teamId: number,
  fixtures: FplFixture[],
  teamShortNames: Map<number, string>,
  count = 3
): UpcomingFixture[] {
  const upcoming = fixtures
    .filter(
      (f) =>
        f.event !== null &&
        !f.finished &&
        (f.team_h === teamId || f.team_a === teamId)
    )
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0))
    .slice(0, count);

  return upcoming.map((f) => {
    const isHome = f.team_h === teamId;
    const opponentId = isHome ? f.team_a : f.team_h;
    const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty;
    return {
      gameweekId: f.event!,
      opponent: teamShortNames.get(opponentId) ?? String(opponentId),
      isHome,
      difficulty,
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const positionParam = searchParams.get("position");
    const maxCostParam = searchParams.get("maxCost");
    const statusParam = searchParams.get("status");

    const position = positionParam ? parseInt(positionParam, 10) : undefined;
    const maxCost = maxCostParam ? parseInt(maxCostParam, 10) : undefined;
    const statusFilter = statusParam ?? undefined;

    const [bootstrap, allFixtures] = await Promise.all([
      fetchBootstrap(),
      fetchFixtures(),
    ]);

    const teamShortNames = new Map<number, string>(
      bootstrap.teams.map((t) => [t.id, t.short_name])
    );

    let elements = bootstrap.elements;

    if (position !== undefined && !isNaN(position)) {
      elements = elements.filter((e) => e.element_type === position);
    }
    if (maxCost !== undefined && !isNaN(maxCost)) {
      elements = elements.filter((e) => e.now_cost <= maxCost);
    }
    if (statusFilter === "a") {
      elements = elements.filter((e) => e.status === "a");
    }

    const players = elements.map((el) => ({
      id: el.id,
      webName: el.web_name,
      teamId: el.team,
      teamShortName: teamShortNames.get(el.team) ?? String(el.team),
      elementType: el.element_type,
      nowCost: el.now_cost,
      totalPoints: el.total_points,
      form: el.form,
      selectedByPercent: el.selected_by_percent,
      ictIndex: el.ict_index,
      status: el.status,
      news: el.news,
      chanceOfPlayingNextRound: el.chance_of_playing_next_round,
      upcomingFixtures: getNextFixtures(el.team, allFixtures, teamShortNames, 3),
    }));

    const ttl = getCacheTtl("player", false);
    return NextResponse.json(
      { players },
      {
        headers: {
          "Cache-Control": buildCacheHeader(ttl),
        },
      }
    );
  } catch (err) {
    console.error("[GET /api/players]", err);
    return NextResponse.json(
      { error: "Failed to fetch players", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
