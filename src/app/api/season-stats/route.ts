import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";
import type { FplChip, FplChipPlay } from "@/lib/fpl/types";

export const dynamic = "force-dynamic";

const CHIP_NAMES = ["wildcard", "bboost", "3xc", "freehit"] as const;
type ChipName = (typeof CHIP_NAMES)[number];

interface ChipSlotStatus {
  name: ChipName;
  windowStart: number;
  windowEnd: number;
  usedInGw: number | null;
}

interface ManagerStats {
  managerId: number;
  displayName: string;
  teamName: string;
  gwsPlayed: number;
  totalPoints: number;
  avgScore: number;
  highest: { gw: number; pts: number };
  lowest: { gw: number; pts: number };
  totalBenchPts: number;
  totalTransferCost: number;
  chipSlots: ChipSlotStatus[];
  gwScores: number[];
}

function resolveChipSlots(
  bootstrapChips: FplChip[],
  historyChips: FplChipPlay[]
): ChipSlotStatus[] {
  const slots: ChipSlotStatus[] = [];

  for (const name of CHIP_NAMES) {
    const windows = bootstrapChips
      .filter((c) => c.name === name)
      .sort((a, b) => a.start_event - b.start_event);

    if (windows.length === 0) {
      const used = historyChips.find((c) => c.name === name);
      slots.push({ name, windowStart: 1, windowEnd: 38, usedInGw: used?.event ?? null });
      continue;
    }

    for (const w of windows) {
      const usedInWindow = historyChips.find(
        (c) => c.name === name && c.event >= w.start_event && c.event <= w.stop_event
      );
      slots.push({
        name,
        windowStart: w.start_event,
        windowEnd: w.stop_event,
        usedInGw: usedInWindow?.event ?? null,
      });
    }
  }

  return slots;
}

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

    const results = await Promise.allSettled(
      org.members.map(async (m): Promise<ManagerStats | null> => {
        const history = await fetchEntryHistory(m.managerId);
        const played = history.current.filter((e) => e.event <= currentGw);
        if (played.length === 0) return null;

        const scores = played.map((e) => ({ gw: e.event, pts: e.points }));
        const highest = scores.reduce((b, s) => (s.pts > b.pts ? s : b), scores[0]);
        const lowest  = scores.reduce((b, s) => (s.pts < b.pts ? s : b), scores[0]);
        const totalBenchPts = played.reduce((s, e) => s + e.points_on_bench, 0);
        const totalTransferCost = played.reduce((s, e) => s + e.event_transfers_cost, 0);
        const avgScore = Math.round((played.reduce((s, e) => s + e.points, 0) / played.length) * 10) / 10;
        const rawTotal = played[played.length - 1]?.total_points ?? 0;
        const deduction = (m.pointsDeductionPerGw ?? 0) * played.length;

        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          teamName: m.teamName ?? "",
          gwsPlayed: played.length,
          totalPoints: rawTotal - deduction,
          avgScore,
          highest: { gw: highest.gw, pts: highest.pts },
          lowest:  { gw: lowest.gw,  pts: lowest.pts  },
          totalBenchPts,
          totalTransferCost,
          chipSlots: resolveChipSlots(bootstrap.chips, history.chips),
          gwScores: played.map((e) => e.points),
        };
      })
    );

    const managers: ManagerStats[] = results
      .filter((r): r is PromiseFulfilledResult<ManagerStats> =>
        r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value);

    return NextResponse.json({ managers, currentGw });
  } catch (err) {
    console.error("[GET /api/season-stats]", err);
    return NextResponse.json(
      { error: "Failed to fetch season stats", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
