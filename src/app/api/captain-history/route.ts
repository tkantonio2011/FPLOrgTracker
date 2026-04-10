import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryPicks,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

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

    // Only process GWs that have started (finished or currently live)
    const playedGws = bootstrap.events
      .filter((e) => e.finished || e.is_current)
      .map((e) => e.id);

    if (playedGws.length === 0) {
      return NextResponse.json({ managers: [], gameweeks: [] });
    }

    const playerMap = new Map(
      bootstrap.elements.map((e) => [e.id, e.web_name])
    );

    // Fetch live event data for all played GWs in parallel (Next.js caches completed GWs)
    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      playedGws.map(async (gw) => {
        try {
          const live = await fetchLiveGw(gw);
          liveByGw.set(
            gw,
            new Map(live.elements.map((el) => [el.id, el.stats.total_points]))
          );
        } catch {
          // GW data unavailable — skip
        }
      })
    );

    // Fetch picks for all managers × all played GWs in parallel
    const isCurrentLive = bootstrap.events.find((e) => e.id === currentGw)?.is_current &&
      !bootstrap.events.find((e) => e.id === currentGw)?.finished;

    const managerData = await Promise.all(
      org.members.map(async (m) => {
        const gwRecords = await Promise.all(
          playedGws.map(async (gw) => {
            try {
              const picks = await fetchEntryPicks(
                m.managerId,
                gw,
                gw === currentGw && !!isCurrentLive
              );
              const captainPick = picks.picks.find((p) => p.is_captain);
              if (!captainPick) return null;

              const liveMap = liveByGw.get(gw);
              const rawPoints = liveMap?.get(captainPick.element) ?? null;
              const multiplier = captainPick.multiplier as 2 | 3; // 2=C, 3=TC
              const chip = picks.active_chip;

              return {
                gw,
                captainId: captainPick.element,
                captainName: playerMap.get(captainPick.element) ?? `#${captainPick.element}`,
                rawPoints,
                multiplier,
                // Net bonus points from captaincy (what captaincy added on top of 1x)
                bonusPts: rawPoints !== null ? rawPoints * (multiplier - 1) : null,
                chipUsed: chip === "3xc" ? "TC" : null,
              };
            } catch {
              return null;
            }
          })
        );

        const valid = gwRecords.filter(
          (r): r is NonNullable<typeof r> & { rawPoints: number } =>
            r !== null && r.rawPoints !== null
        );

        const totalCaptainPts = valid.reduce((s, r) => s + r.rawPoints, 0);
        const avgCaptainPts =
          valid.length > 0
            ? Math.round((totalCaptainPts / valid.length) * 10) / 10
            : 0;

        const best = valid.reduce(
          (b, r) => (r.rawPoints > b.rawPoints ? r : b),
          valid[0] ?? { rawPoints: 0, gw: 0, captainName: "—" }
        );
        const worst = valid.reduce(
          (b, r) => (r.rawPoints < b.rawPoints ? r : b),
          valid[0] ?? { rawPoints: 999, gw: 0, captainName: "—" }
        );

        const blanks = valid.filter((r) => r.rawPoints <= 2).length;

        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          teamName: m.teamName ?? "",
          avgCaptainPts,
          totalCaptainPts,
          gwsWithCaptain: valid.length,
          blanks,
          bestGw:
            valid.length > 0
              ? { gw: best.gw, captainName: best.captainName, pts: best.rawPoints }
              : null,
          worstGw:
            valid.length > 0
              ? { gw: worst.gw, captainName: worst.captainName, pts: worst.rawPoints }
              : null,
          gwData: gwRecords,
        };
      })
    );

    // Sort leaderboard by avg captain pts descending
    const sorted = [...managerData].sort(
      (a, b) => b.avgCaptainPts - a.avgCaptainPts
    );

    return NextResponse.json({
      managers: sorted,
      gameweeks: playedGws,
      currentGw,
    });
  } catch (err) {
    console.error("[GET /api/captain-history]", err);
    return NextResponse.json(
      { error: "Failed to fetch captain history", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
