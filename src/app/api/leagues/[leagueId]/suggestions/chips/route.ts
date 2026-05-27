import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchFixtures,
  getCurrentGw,
} from "@/lib/fpl/client";
import type { FplPick, FplChip, FplChipPlay } from "@/lib/fpl/types";
import { buildCacheHeader, getCacheTtl } from "@/lib/cache";
import {
  scoreBenchBoost,
  scoreFreeHit,
  scoreTripleCaptain,
  scoreWildcard,
} from "@/lib/suggestions/chips";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseQuery, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ChipStatus {
  available: boolean;
  usedInGameweek?: number;
  reasoning: string;
}

function resolveChipAvailability(
  chipName: "wildcard" | "bboost" | "3xc" | "freehit",
  currentGw: number,
  bootstrapChips: FplChip[],
  historyChips: FplChipPlay[],
): ChipStatus {
  const windows = bootstrapChips
    .filter((c) => c.name === chipName)
    .sort((a, b) => a.start_event - b.start_event);

  if (windows.length === 0) {
    const used = historyChips.find((c) => c.name === chipName);
    return used
      ? { available: false, usedInGameweek: used.event, reasoning: `Already used in GW${used.event}.` }
      : { available: true, reasoning: "Available." };
  }

  const activeWindow = windows.find(
    (w) => currentGw >= w.start_event && currentGw <= w.stop_event,
  );
  const nextWindow = windows.find((w) => w.start_event > currentGw) ?? null;

  if (!activeWindow) {
    const allUses = historyChips.filter((c) => c.name === chipName);
    const exhausted = windows.every((w) =>
      historyChips.some((c) => c.name === chipName && c.event >= w.start_event && c.event <= w.stop_event),
    );
    if (exhausted) {
      const gwList = allUses.map((u) => `GW${u.event}`).join(", ");
      return {
        available: false,
        usedInGameweek: allUses[allUses.length - 1]?.event,
        reasoning: windows.length > 1 ? `Both chips used (${gwList}).` : `Already used in GW${allUses[0]?.event}.`,
      };
    }
    if (nextWindow) {
      return { available: false, reasoning: `Not yet available. Unlocks from GW${nextWindow.start_event}.` };
    }
    return { available: false, reasoning: "No longer available this season." };
  }

  const usedInWindow = historyChips.find(
    (c) => c.name === chipName && c.event >= activeWindow.start_event && c.event <= activeWindow.stop_event,
  );
  if (usedInWindow) {
    if (nextWindow) {
      return {
        available: false,
        usedInGameweek: usedInWindow.event,
        reasoning: `Used in GW${usedInWindow.event}. Next chip available from GW${nextWindow.start_event}.`,
      };
    }
    return { available: false, usedInGameweek: usedInWindow.event, reasoning: `Already used in GW${usedInWindow.event}.` };
  }

  if (windows.length > 1) {
    const windowNum = windows.indexOf(activeWindow) + 1;
    return {
      available: true,
      reasoning: `Available (slot ${windowNum}/${windows.length} · GW${activeWindow.start_event}–GW${activeWindow.stop_event}).`,
    };
  }
  return { available: true, reasoning: "Available." };
}

const querySchema = z.object({
  managerId: z.coerce.number().int().positive(),
});

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);
    const query = parseQuery(req, querySchema);

    const membership = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: league.id, managerId: query.managerId } },
    });
    if (!membership || !membership.isActive) {
      return fail("Manager is not a member of this league", 404);
    }

    let bootstrap, fixtures, history, leagueMembers;
    try {
      [bootstrap, fixtures, history, leagueMembers] = await Promise.all([
        fetchBootstrap(),
        fetchFixtures(),
        fetchEntryHistory(query.managerId),
        db.leagueMembership.findMany({ where: { leagueId: league.id, isActive: true } }),
      ]);
    } catch {
      return fail("FPL API unavailable", 503);
    }

    const currentGw = getCurrentGw(bootstrap.events);
    const upcomingGws = bootstrap.events.map((e) => e.id).filter((id) => id >= currentGw);
    const allTeamIds = bootstrap.teams.map((t) => t.id);

    let picks: FplPick[] = [];
    try {
      const picksData = await fetchEntryPicks(query.managerId, currentGw, true);
      picks = picksData.picks;
    } catch {
      // proceed without squad-specific picks
    }

    const bootstrapChips = bootstrap.chips ?? [];
    const bbStatus = resolveChipAvailability("bboost", currentGw, bootstrapChips, history.chips);
    const tcStatus = resolveChipAvailability("3xc", currentGw, bootstrapChips, history.chips);
    const wcStatus = resolveChipAvailability("wildcard", currentGw, bootstrapChips, history.chips);
    const fhStatus = resolveChipAvailability("freehit", currentGw, bootstrapChips, history.chips);

    const [bbResult, tcResult, wcResult, fhResult] = await Promise.all([
      Promise.resolve(
        !bbStatus.available
          ? { available: false, usedInGameweek: bbStatus.usedInGameweek, recommendedGameweek: null, reasoning: bbStatus.reasoning }
          : scoreBenchBoost({ picks, elements: bootstrap.elements, fixtures, currentGw, upcomingGws }),
      ),
      Promise.resolve(
        !tcStatus.available
          ? { available: false, usedInGameweek: tcStatus.usedInGameweek, recommendedGameweek: null, reasoning: tcStatus.reasoning }
          : scoreTripleCaptain({ picks, elements: bootstrap.elements, fixtures, currentGw, upcomingGws }),
      ),
      Promise.resolve(
        !wcStatus.available
          ? { available: false, usedInGameweek: wcStatus.usedInGameweek, recommendedGameweek: null, reasoning: wcStatus.reasoning }
          : scoreWildcard({ picks, elements: bootstrap.elements, fixtures, currentGw, upcomingGws }),
      ),
      Promise.resolve(
        !fhStatus.available
          ? { available: false, usedInGameweek: fhStatus.usedInGameweek, recommendedGameweek: null, reasoning: fhStatus.reasoning }
          : scoreFreeHit({ picks, elements: bootstrap.elements, fixtures, currentGw, upcomingGws, allTeamIds }),
      ),
    ]);

    const memberHistoryResults = await Promise.allSettled(
      leagueMembers.map((m) => fetchEntryHistory(m.managerId)),
    );

    const orgChipUsage = leagueMembers.map((m, i) => {
      const result = memberHistoryResults[i];
      if (result.status === "rejected") {
        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          benchBoostUsed: false,
          tripleCaptainUsed: false,
          wildcardUsed: false,
          freeHitUsed: false,
        };
      }
      const memberChips = result.value.chips;
      const notAvailable = (name: "bboost" | "3xc" | "wildcard" | "freehit") =>
        !resolveChipAvailability(name, currentGw, bootstrapChips, memberChips).available;

      return {
        managerId: m.managerId,
        displayName: m.displayName ?? `Manager ${m.managerId}`,
        benchBoostUsed: notAvailable("bboost"),
        tripleCaptainUsed: notAvailable("3xc"),
        wildcardUsed: notAvailable("wildcard"),
        freeHitUsed: notAvailable("freehit"),
      };
    });

    const revalidate = getCacheTtl("suggestions", false);
    return ok(
      {
        managerId: query.managerId,
        chips: {
          benchBoost: bbResult,
          tripleCaptain: tcResult,
          wildcard: wcResult,
          freeHit: fhResult,
        },
        orgChipUsage,
      },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } },
    );
  } catch (err) {
    return failFromError(err);
  }
}
