import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryTransfers,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface RegretTransfer {
  playerIn: { id: number; name: string; pts: number };
  playerOut: { id: number; name: string; pts: number };
  net: number;
}

export interface RegretGw {
  gw: number;
  transfers: RegretTransfer[];
  hitCost: number;
  chipUsed: string | null;
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

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length === 0) return ok({ managers: [], currentGw: 0 });

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);

    const playerName = new Map(bootstrap.elements.map((e) => [e.id, e.web_name]));

    const memberData = await Promise.all(
      memberships.map(async (m) => {
        const [transfers, history] = await Promise.all([
          fetchEntryTransfers(m.managerId),
          fetchEntryHistory(m.managerId),
        ]);
        return { member: m, transfers, history };
      }),
    );

    const uniqueGws = Array.from(
      new Set(
        memberData.flatMap(({ transfers }) =>
          transfers.map((t) => t.event).filter((gw) => gw <= currentGw),
        ),
      ),
    );

    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      uniqueGws.map(async (gw) => {
        const live = await fetchLiveGw(gw);
        liveByGw.set(
          gw,
          new Map(live.elements.map((el) => [el.id, el.stats.total_points])),
        );
      }),
    );

    const managers: ManagerRegret[] = memberData.map(({ member, transfers, history }) => {
      const deduction = member.pointsDeductionPerGw;

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

        const hitCost = -(histEntry?.event_transfers_cost ?? 0);

        const regretTransfers: RegretTransfer[] = gwTransfers.map((t) => {
          const inPts = (gwPts?.get(t.element_in) ?? 0) - deduction;
          const outPts = (gwPts?.get(t.element_out) ?? 0) - deduction;
          return {
            playerIn: {
              id: t.element_in,
              name: playerName.get(t.element_in) ?? `#${t.element_in}`,
              pts: inPts,
            },
            playerOut: {
              id: t.element_out,
              name: playerName.get(t.element_out) ?? `#${t.element_out}`,
              pts: outPts,
            },
            net: inPts - outPts,
          };
        });

        const transfersNet = regretTransfers.reduce((s, t) => s + t.net, 0);
        const gwNet = transfersNet + hitCost;

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
    });

    managers.sort((a, b) => b.seasonNet - a.seasonNet);

    return ok({ managers, currentGw });
  } catch (err) {
    return failFromError(err);
  }
}
