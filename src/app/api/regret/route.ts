import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryTransfers,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export interface RegretTransfer {
  playerIn:  { id: number; name: string; pts: number };
  playerOut: { id: number; name: string; pts: number };
  /** in.pts − out.pts  (before hit cost) */
  net: number;
}

export interface RegretGw {
  gw: number;
  transfers: RegretTransfer[];
  hitCost: number;   // 0 or negative e.g. -4, -8
  chipUsed: string | null;
  /** sum of individual nets + hitCost */
  gwNet: number;
}

export interface ManagerRegret {
  managerId: number;
  displayName: string;
  teamName: string;
  gws: RegretGw[];
  seasonNet: number;
  totalHitCost: number;
  bestTransfer: (RegretTransfer & { gw: number }) | null;
  worstTransfer: (RegretTransfer & { gw: number }) | null;
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

    // Quick player name lookup
    const playerName = new Map(
      bootstrap.elements.map((e) => [e.id, e.web_name])
    );

    // Fetch all transfers + histories in parallel across all members
    const memberData = await Promise.all(
      org.members.map(async (m) => {
        const [transfers, history] = await Promise.all([
          fetchEntryTransfers(m.managerId),
          fetchEntryHistory(m.managerId),
        ]);
        return { member: m, transfers, history };
      })
    );

    // Collect unique GWs that have at least one transfer
    const uniqueGws = Array.from(
      new Set(
        memberData.flatMap(({ transfers }) =>
          transfers.map((t) => t.event).filter((gw) => gw <= currentGw)
        )
      )
    );

    // Fetch live GW data for all relevant GWs in parallel (cached by Next.js)
    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      uniqueGws.map(async (gw) => {
        const live = await fetchLiveGw(gw);
        liveByGw.set(
          gw,
          new Map(live.elements.map((el) => [el.id, el.stats.total_points]))
        );
      })
    );

    // Build per-manager regret data
    const managers: ManagerRegret[] = memberData.map(
      ({ member, transfers, history }) => {
        const deduction = member.pointsDeductionPerGw ?? 0;

        // Group transfers by GW
        const byGw = new Map<number, typeof transfers>();
        for (const t of transfers) {
          if (t.event > currentGw) continue;
          const list = byGw.get(t.event) ?? [];
          list.push(t);
          byGw.set(t.event, list);
        }

        const gws: RegretGw[] = [];
        let bestTransfer: (RegretTransfer & { gw: number }) | null = null;
        let worstTransfer: (RegretTransfer & { gw: number }) | null = null;

        for (const [gw, gwTransfers] of Array.from(byGw)) {
          const gwPts = liveByGw.get(gw);
          const histEntry = history.current.find((e) => e.event === gw);
          const chip = history.chips.find((c) => c.event === gw);

          // Hit cost: stored as positive in history (e.g. 4 = -4 pts applied)
          const hitCost = -(histEntry?.event_transfers_cost ?? 0);

          const regretTransfers: RegretTransfer[] = gwTransfers.map((t) => {
            const inPts  = (gwPts?.get(t.element_in)  ?? 0) - deduction;
            const outPts = (gwPts?.get(t.element_out) ?? 0) - deduction;
            return {
              playerIn:  { id: t.element_in,  name: playerName.get(t.element_in)  ?? `#${t.element_in}`,  pts: inPts  },
              playerOut: { id: t.element_out, name: playerName.get(t.element_out) ?? `#${t.element_out}`, pts: outPts },
              net: inPts - outPts,
            };
          });

          const transfersNet = regretTransfers.reduce((s, t) => s + t.net, 0);
          const gwNet = transfersNet + hitCost;

          // Track best/worst individual transfers
          for (const t of regretTransfers) {
            if (!bestTransfer || t.net > bestTransfer.net) bestTransfer = { ...t, gw };
            if (!worstTransfer || t.net < worstTransfer.net) worstTransfer = { ...t, gw };
          }

          gws.push({
            gw,
            transfers: regretTransfers,
            hitCost,
            chipUsed: chip?.name ?? null,
            gwNet,
          });
        }

        // Sort GWs newest-first
        gws.sort((a, b) => b.gw - a.gw);

        const seasonNet = gws.reduce((s, g) => s + g.gwNet, 0);
        const totalHitCost = gws.reduce((s, g) => s + g.hitCost, 0);

        return {
          managerId: member.managerId,
          displayName: member.displayName ?? `Manager ${member.managerId}`,
          teamName: member.teamName ?? "",
          gws,
          seasonNet,
          totalHitCost,
          bestTransfer,
          worstTransfer,
        };
      }
    );

    // Sort managers by season net descending
    managers.sort((a, b) => b.seasonNet - a.seasonNet);

    return NextResponse.json({ managers, currentGw });
  } catch (err) {
    console.error("[GET /api/regret]", err);
    return NextResponse.json(
      { error: "Failed to compute transfer regret", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
