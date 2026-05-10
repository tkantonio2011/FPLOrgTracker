import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryPicks, getCurrentGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FLAGGED_STATUSES = new Set(["d", "i", "s", "u", "n"]);

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
        gameweekId: 0,
        gameweekName: "",
        deadlineTime: null,
        totalMembers: 0,
        alerts: [],
        allClear: true,
      });
    }

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);
    const currentEvent = bootstrap.events.find((e) => e.id === currentGw);

    const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));

    const flaggedElements = new Map(
      bootstrap.elements
        .filter((e) => FLAGGED_STATUSES.has(e.status))
        .map((e) => [e.id, e]),
    );

    const ownershipMap = new Map<
      number,
      { name: string; isCaptain: boolean; isViceCaptain: boolean; isStarting: boolean }[]
    >();

    for (const m of memberships) {
      const name = m.displayName ?? `Manager ${m.managerId}`;
      try {
        const picks = await fetchEntryPicks(m.managerId, currentGw, false);
        for (const pick of picks.picks) {
          if (!flaggedElements.has(pick.element)) continue;
          const existing = ownershipMap.get(pick.element) ?? [];
          existing.push({
            name,
            isCaptain: pick.is_captain,
            isViceCaptain: pick.is_vice_captain,
            isStarting: pick.position <= 11,
          });
          ownershipMap.set(pick.element, existing);
        }
      } catch {
        // private team — skip
      }
    }

    const alerts = Array.from(ownershipMap.entries())
      .map(([playerId, owners]) => {
        const el = flaggedElements.get(playerId)!;
        return {
          playerId,
          webName: el.web_name,
          fullName: `${el.first_name} ${el.second_name}`,
          team: teamMap.get(el.team) ?? "???",
          elementType: el.element_type,
          status: el.status as "d" | "i" | "s" | "u" | "n",
          news: el.news,
          newsAdded: el.news_added,
          chanceThisRound: el.chance_of_playing_this_round,
          chanceNextRound: el.chance_of_playing_next_round,
          nowCost: el.now_cost,
          owners,
          ownerCount: owners.length,
          captainedBy: owners.filter((o) => o.isCaptain).map((o) => o.name),
          viceCaptainedBy: owners.filter((o) => o.isViceCaptain).map((o) => o.name),
        };
      })
      .sort((a, b) => {
        const severityA = a.status === "d" ? 0 : 1;
        const severityB = b.status === "d" ? 0 : 1;
        if (severityB !== severityA) return severityB - severityA;
        return b.ownerCount - a.ownerCount;
      });

    return ok({
      gameweekId: currentGw,
      gameweekName: currentEvent?.name ?? `GW ${currentGw}`,
      deadlineTime: currentEvent
        ? bootstrap.events.find((e) => e.id === currentGw + 1)?.deadline_time ?? null
        : null,
      totalMembers: memberships.length,
      alerts,
      allClear: alerts.length === 0,
    });
  } catch (err) {
    return failFromError(err);
  }
}
