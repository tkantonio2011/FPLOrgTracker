import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, fetchEntryPicks, getCurrentGw } from "@/lib/fpl/client";
import { fetchFixtures } from "@/lib/fpl/client";
import type { FplPick, FplChip, FplChipPlay } from "@/lib/fpl/types";
import { getCacheTtl, buildCacheHeader } from "@/lib/cache";
import {
  scoreBenchBoost,
  scoreTripleCaptain,
  scoreWildcard,
  scoreFreeHit,
} from "@/lib/suggestions/chips";

// ─── Chip availability using bootstrap windows ───────────────────────────────
// bootstrap.chips contains { name, start_event, stop_event } per chip slot.
// For 2025/26 all four chips have H1 + H2 variants, so we must check whether
// the manager has used the chip *within the active window*, not just globally.

interface ChipStatus {
  available: boolean;
  usedInGameweek?: number;
  reasoning: string;
}

function resolveChipAvailability(
  chipName: "wildcard" | "bboost" | "3xc" | "freehit",
  currentGw: number,
  bootstrapChips: FplChip[],
  historyChips: FplChipPlay[]
): ChipStatus {
  const windows = bootstrapChips
    .filter((c) => c.name === chipName)
    .sort((a, b) => a.start_event - b.start_event);

  // No windows returned by API — fall back to simple single-use check
  if (windows.length === 0) {
    const used = historyChips.find((c) => c.name === chipName);
    return used
      ? { available: false, usedInGameweek: used.event, reasoning: `Already used in GW${used.event}.` }
      : { available: true, reasoning: "Available." };
  }

  const activeWindow = windows.find(
    (w) => currentGw >= w.start_event && currentGw <= w.stop_event
  );
  const nextWindow = windows.find((w) => w.start_event > currentGw) ?? null;

  // ── Not in any active window ──────────────────────────────────────────────
  if (!activeWindow) {
    // Collect all uses
    const allUses = historyChips.filter((c) => c.name === chipName);
    // Check whether every window has been consumed
    const exhausted = windows.every((w) =>
      historyChips.some((c) => c.name === chipName && c.event >= w.start_event && c.event <= w.stop_event)
    );

    if (exhausted) {
      const gwList = allUses.map((u) => `GW${u.event}`).join(", ");
      return {
        available: false,
        usedInGameweek: allUses[allUses.length - 1]?.event,
        reasoning:
          windows.length > 1
            ? `Both chips used (${gwList}).`
            : `Already used in GW${allUses[0]?.event}.`,
      };
    }

    // There's a future window — chip unlocks later
    if (nextWindow) {
      return {
        available: false,
        reasoning: `Not yet available. Unlocks from GW${nextWindow.start_event}.`,
      };
    }

    return { available: false, reasoning: "No longer available this season." };
  }

  // ── Inside an active window ───────────────────────────────────────────────
  const usedInWindow = historyChips.find(
    (c) =>
      c.name === chipName &&
      c.event >= activeWindow.start_event &&
      c.event <= activeWindow.stop_event
  );

  if (usedInWindow) {
    if (nextWindow) {
      return {
        available: false,
        usedInGameweek: usedInWindow.event,
        reasoning: `Used in GW${usedInWindow.event}. Next chip available from GW${nextWindow.start_event}.`,
      };
    }
    return {
      available: false,
      usedInGameweek: usedInWindow.event,
      reasoning: `Already used in GW${usedInWindow.event}.`,
    };
  }

  // Available in current window
  if (windows.length > 1) {
    const windowNum = windows.indexOf(activeWindow) + 1;
    return {
      available: true,
      reasoning: `Available (slot ${windowNum}/${windows.length} · GW${activeWindow.start_event}–GW${activeWindow.stop_event}).`,
    };
  }

  return { available: true, reasoning: "Available." };
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const managerId = parseInt(searchParams.get("managerId") ?? "0");

    if (!managerId) {
      return NextResponse.json({ error: "managerId is required", code: "VALIDATION_ERROR" }, { status: 422 });
    }

    const [bootstrap, fixtures, history, org] = await Promise.all([
      fetchBootstrap(),
      fetchFixtures(),
      fetchEntryHistory(managerId),
      db.organisation.findFirst({ include: { members: { where: { isActive: true } } } }),
    ]);

    const currentGw = getCurrentGw(bootstrap.events);
    const upcomingGws = bootstrap.events.map((e) => e.id).filter((id) => id >= currentGw);
    const allTeamIds = bootstrap.teams.map((t) => t.id);

    // Get current squad picks
    let picks: FplPick[] = [];
    try {
      const picksData = await fetchEntryPicks(managerId, currentGw, true);
      picks = picksData.picks;
    } catch {
      // Can't get picks — proceed without squad-specific recommendations
    }

    const bootstrapChips = bootstrap.chips ?? [];
    const bbStatus = resolveChipAvailability("bboost", currentGw, bootstrapChips, history.chips);
    const tcStatus = resolveChipAvailability("3xc", currentGw, bootstrapChips, history.chips);
    const wcStatus = resolveChipAvailability("wildcard", currentGw, bootstrapChips, history.chips);
    const fhStatus = resolveChipAvailability("freehit", currentGw, bootstrapChips, history.chips);

    const upcomingGwsArr = upcomingGws;

    const [bbResult, tcResult, wcResult, fhResult] = await Promise.all([
      Promise.resolve(
        !bbStatus.available
          ? { available: false, usedInGameweek: bbStatus.usedInGameweek, recommendedGameweek: null, reasoning: bbStatus.reasoning }
          : scoreBenchBoost({ picks, elements: bootstrap.elements, fixtures, currentGw, upcomingGws: upcomingGwsArr })
      ),
      Promise.resolve(
        !tcStatus.available
          ? { available: false, usedInGameweek: tcStatus.usedInGameweek, recommendedGameweek: null, reasoning: tcStatus.reasoning }
          : scoreTripleCaptain({ picks, elements: bootstrap.elements, fixtures, currentGw, upcomingGws: upcomingGwsArr })
      ),
      Promise.resolve(
        !wcStatus.available
          ? { available: false, usedInGameweek: wcStatus.usedInGameweek, recommendedGameweek: null, reasoning: wcStatus.reasoning }
          : scoreWildcard({ picks, elements: bootstrap.elements, fixtures, currentGw, upcomingGws: upcomingGwsArr })
      ),
      Promise.resolve(
        !fhStatus.available
          ? { available: false, usedInGameweek: fhStatus.usedInGameweek, recommendedGameweek: null, reasoning: fhStatus.reasoning }
          : scoreFreeHit({ picks, elements: bootstrap.elements, fixtures, currentGw, upcomingGws: upcomingGwsArr, allTeamIds })
      ),
    ]);

    // Org chip usage — fetch history for each member in parallel
    const orgMembers = org?.members ?? [];
    const memberHistoryResults = await Promise.allSettled(
      orgMembers.map((m) => fetchEntryHistory(m.managerId))
    );

    const orgChipUsage = orgMembers.map((m, i) => {
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
      // "Used" means the chip is no longer available in the current window —
      // not just that it was ever played (important for 2025/26 where all chips
      // have H1 + H2 slots and playing H1 doesn't consume H2).
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
    return NextResponse.json(
      {
        managerId,
        chips: {
          benchBoost: bbResult,
          tripleCaptain: tcResult,
          wildcard: wcResult,
          freeHit: fhResult,
        },
        orgChipUsage,
      },
      { headers: { "Cache-Control": buildCacheHeader(revalidate) } }
    );
  } catch (err) {
    console.error("Chips suggestion error:", err);
    return NextResponse.json({ error: "FPL API unavailable", code: "FPL_API_UNAVAILABLE" }, { status: 503 });
  }
}
