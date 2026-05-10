import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryPicks,
  fetchFixtures,
  getCurrentGw,
} from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length < 2) {
      return ok({
        gameweekId: 0,
        gameweekName: "",
        totalMembers: memberships.length,
        differentials: [],
      });
    }

    let bootstrap;
    let allFixtures;
    try {
      [bootstrap, allFixtures] = await Promise.all([fetchBootstrap(), fetchFixtures()]);
    } catch {
      return fail("FPL API unavailable", 503);
    }

    const currentGw = getCurrentGw(bootstrap.events);
    const currentEvent = bootstrap.events.find((e) => e.id === currentGw);
    const now = Date.now();

    const nextFixtureByTeam = new Map<
      number,
      { opponent: string; fdr: number; isHome: boolean; kickoffTime: string | null }
    >();
    const teamShortName = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));

    for (const f of allFixtures) {
      if (f.finished) continue;
      if (f.kickoff_time && new Date(f.kickoff_time).getTime() < now) continue;

      for (const [teamId, fdr, isHome] of [
        [f.team_h, f.team_h_difficulty, true],
        [f.team_a, f.team_a_difficulty, false],
      ] as [number, number, boolean][]) {
        if (!nextFixtureByTeam.has(teamId)) {
          const opponentId = isHome ? f.team_a : f.team_h;
          nextFixtureByTeam.set(teamId, {
            opponent: teamShortName.get(opponentId) ?? "???",
            fdr,
            isHome,
            kickoffTime: f.kickoff_time,
          });
        }
      }
    }

    const ownerMap = new Map<number, string[]>();
    const nonOwnerList = memberships.map(
      (m) => m.displayName ?? `Manager ${m.managerId}`,
    );

    const nonOwnersByPlayer = new Map<number, Set<string>>();

    for (const m of memberships) {
      const name = m.displayName ?? `Manager ${m.managerId}`;
      try {
        const picks = await fetchEntryPicks(m.managerId, currentGw, false);
        const ownedIds = new Set(picks.picks.map((p) => p.element));

        for (const el of bootstrap.elements) {
          if (!ownedIds.has(el.id)) {
            if (!nonOwnersByPlayer.has(el.id)) {
              nonOwnersByPlayer.set(el.id, new Set(nonOwnerList));
            }
          }
        }

        for (const pick of picks.picks) {
          const existing = ownerMap.get(pick.element) ?? [];
          existing.push(name);
          ownerMap.set(pick.element, existing);
        }
      } catch {
        // Private team — skip
      }
    }

    const totalMembers = memberships.length;

    const differentials = [];

    for (const [playerId, owners] of Array.from(ownerMap.entries())) {
      const ownerCount = owners.length;
      if (ownerCount === 0 || ownerCount === totalMembers) continue;

      const el = bootstrap.elements.find((e) => e.id === playerId);
      if (!el) continue;

      const nonOwners = nonOwnerList.filter((n) => !owners.includes(n));
      const fixture = nextFixtureByTeam.get(el.team);

      const form = parseFloat(el.form) || 0;
      const epThis = parseFloat(el.ep_this) || 0;
      const epNext = parseFloat(el.ep_next) || 0;

      const p = ownerCount / totalMembers;
      const splitFactor = 4 * p * (1 - p);

      const relevantEp = epThis > 0 ? epThis : epNext;
      const swingScore = Math.round(relevantEp * splitFactor * totalMembers * 10) / 10;

      differentials.push({
        playerId,
        webName: el.web_name,
        fullName: `${el.first_name} ${el.second_name}`,
        team: teamShortName.get(el.team) ?? "???",
        elementType: el.element_type,
        nowCost: el.now_cost,
        form,
        epThis,
        epNext,
        swingScore,
        ownerCount,
        totalMembers,
        leagueOwnerPercent: Math.round((ownerCount / totalMembers) * 100),
        owners,
        nonOwners,
        nextFixture: fixture ?? null,
      });
    }

    differentials.sort((a, b) => b.swingScore - a.swingScore);

    return ok({
      gameweekId: currentGw,
      gameweekName: currentEvent?.name ?? `GW ${currentGw}`,
      totalMembers,
      differentials,
    });
  } catch (err) {
    return failFromError(err);
  }
}
