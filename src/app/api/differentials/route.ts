import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryPicks,
  fetchFixtures,
  getCurrentGw,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org || org.members.length < 2) {
      return NextResponse.json(
        { error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" },
        { status: 404 }
      );
    }

    const [bootstrap, allFixtures] = await Promise.all([
      fetchBootstrap(),
      fetchFixtures(),
    ]);

    const currentGw = getCurrentGw(bootstrap.events);
    const currentEvent = bootstrap.events.find((e) => e.id === currentGw);
    const now = Date.now();

    // Next fixture per team: earliest upcoming fixture after now
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

    // Aggregate ownership: playerId → list of manager display names who own them
    const ownerMap = new Map<number, string[]>();
    const nonOwnerList = org.members.map(
      (m) => m.displayName ?? `Manager ${m.managerId}`
    );

    // Build full non-owner tracking: playerId → Set of manager names who DON'T own
    const nonOwnersByPlayer = new Map<number, Set<string>>();

    for (const m of org.members) {
      const name = m.displayName ?? `Manager ${m.managerId}`;
      try {
        const picks = await fetchEntryPicks(m.managerId, currentGw, false);
        const ownedIds = new Set(picks.picks.map((p) => p.element));

        // For every player in bootstrap, track non-owners
        for (const el of bootstrap.elements) {
          if (!ownedIds.has(el.id)) {
            if (!nonOwnersByPlayer.has(el.id)) {
              nonOwnersByPlayer.set(el.id, new Set(nonOwnerList));
            }
            // keep set unchanged; we'll subtract owners below
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

    const totalMembers = org.members.length;

    // Build differentials: players owned by 1..totalMembers-1 managers
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

      // Split factor: peaks at 1.0 when exactly 50% own; 0 at 0% or 100%
      // formula: 4 * p * (1 - p) where p = ownerCount / totalMembers
      const p = ownerCount / totalMembers;
      const splitFactor = 4 * p * (1 - p);

      // Swing score: how impactful is this differential?
      // = expected points × split factor × totalMembers
      // "If this player scores epNext pts, splitFactor × totalMembers managers are on each side"
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
        orgOwnerPercent: Math.round((ownerCount / totalMembers) * 100),
        owners,
        nonOwners,
        nextFixture: fixture ?? null,
      });
    }

    // Sort by swing score descending
    differentials.sort((a, b) => b.swingScore - a.swingScore);

    return NextResponse.json({
      gameweekId: currentGw,
      gameweekName: currentEvent?.name ?? `GW ${currentGw}`,
      totalMembers,
      differentials,
    });
  } catch (err) {
    console.error("[GET /api/differentials]", err);
    return NextResponse.json(
      { error: "Failed to fetch differentials", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
