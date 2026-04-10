import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryPicks, getCurrentGw } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

// Statuses that warrant a flag (anything other than "a" = available)
const FLAGGED_STATUSES = new Set(["d", "i", "s", "u", "n"]);

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
    const currentEvent = bootstrap.events.find((e) => e.id === currentGw);

    const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));

    // Pre-index all flagged players for O(1) lookup
    const flaggedElements = new Map(
      bootstrap.elements
        .filter((e) => FLAGGED_STATUSES.has(e.status))
        .map((e) => [e.id, e])
    );

    // Collect ownership: playerId → { ownerName, isCaptain, isViceCaptain, isStarting }[]
    const ownershipMap = new Map<
      number,
      { name: string; isCaptain: boolean; isViceCaptain: boolean; isStarting: boolean }[]
    >();

    for (const m of org.members) {
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

    // Build alert list — only players owned by at least one org member
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
          // A captain/VC with a flag is especially urgent
          captainedBy: owners.filter((o) => o.isCaptain).map((o) => o.name),
          viceCaptainedBy: owners.filter((o) => o.isViceCaptain).map((o) => o.name),
        };
      })
      // Sort: more owners first, then by severity (out > doubtful)
      .sort((a, b) => {
        const severityA = a.status === "d" ? 0 : 1;
        const severityB = b.status === "d" ? 0 : 1;
        if (severityB !== severityA) return severityB - severityA; // out before doubt
        return b.ownerCount - a.ownerCount;
      });

    return NextResponse.json({
      gameweekId: currentGw,
      gameweekName: currentEvent?.name ?? `GW ${currentGw}`,
      deadlineTime: currentEvent
        ? bootstrap.events.find((e) => e.id === currentGw + 1)?.deadline_time ?? null
        : null,
      totalMembers: org.members.length,
      alerts,
      allClear: alerts.length === 0,
    });
  } catch (err) {
    console.error("[GET /api/player-status]", err);
    return NextResponse.json(
      { error: "Failed to fetch player status", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
