import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryTransfers,
  getCurrentGw,
} from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseQuery, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  gw: z.coerce.number().int().min(1).max(38).optional(),
});

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);
    const query = parseQuery(req, querySchema);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      return fail("FPL API unavailable", 503);
    }
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = query.gw ?? currentGw;

    const playerMap = new Map(
      bootstrap.elements.map((e) => [
        e.id,
        {
          name: e.web_name,
          team: bootstrap.teams.find((t) => t.id === e.team)?.short_name ?? "???",
          elementType: e.element_type,
        },
      ]),
    );

    const memberResults = await Promise.allSettled(
      memberships.map(async (m) => {
        const [allTransfers, history] = await Promise.all([
          fetchEntryTransfers(m.managerId),
          fetchEntryHistory(m.managerId),
        ]);

        const gwTransfers = allTransfers.filter((t) => t.event === gw);
        const gwHistory = history.current.find((h) => h.event === gw);
        const transferCost = gwHistory?.event_transfers_cost ?? 0;

        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          teamName: m.teamName ?? "",
          transferCost,
          transfers: gwTransfers.map((t) => ({
            playerIn: {
              id: t.element_in,
              name: playerMap.get(t.element_in)?.name ?? `Player ${t.element_in}`,
              team: playerMap.get(t.element_in)?.team ?? "???",
              elementType: playerMap.get(t.element_in)?.elementType ?? 0,
              costTenths: t.element_in_cost,
            },
            playerOut: {
              id: t.element_out,
              name: playerMap.get(t.element_out)?.name ?? `Player ${t.element_out}`,
              team: playerMap.get(t.element_out)?.team ?? "???",
              elementType: playerMap.get(t.element_out)?.elementType ?? 0,
              costTenths: t.element_out_cost,
            },
            time: t.time,
          })),
        };
      }),
    );

    const managers = memberResults
      .filter(
        (r): r is PromiseFulfilledResult<{
          managerId: number;
          displayName: string;
          teamName: string;
          transferCost: number;
          transfers: {
            playerIn: { id: number; name: string; team: string; elementType: number; costTenths: number };
            playerOut: { id: number; name: string; team: string; elementType: number; costTenths: number };
            time: string;
          }[];
        }> => r.status === "fulfilled",
      )
      .map((r) => r.value);

    const inCount = new Map<
      number,
      { name: string; team: string; elementType: number; managers: string[] }
    >();
    const outCount = new Map<
      number,
      { name: string; team: string; elementType: number; managers: string[] }
    >();

    for (const m of managers) {
      for (const t of m.transfers) {
        const inEntry = inCount.get(t.playerIn.id) ?? { ...t.playerIn, managers: [] };
        inEntry.managers.push(m.displayName);
        inCount.set(t.playerIn.id, inEntry);
        const outEntry = outCount.get(t.playerOut.id) ?? { ...t.playerOut, managers: [] };
        outEntry.managers.push(m.displayName);
        outCount.set(t.playerOut.id, outEntry);
      }
    }

    const popularIns = Array.from(inCount.entries())
      .map(([id, d]) => ({
        playerId: id,
        name: d.name,
        team: d.team,
        elementType: d.elementType,
        count: d.managers.length,
        managers: d.managers,
      }))
      .sort((a, b) => b.count - a.count);

    const popularOuts = Array.from(outCount.entries())
      .map(([id, d]) => ({
        playerId: id,
        name: d.name,
        team: d.team,
        elementType: d.elementType,
        count: d.managers.length,
        managers: d.managers,
      }))
      .sort((a, b) => b.count - a.count);

    const availableGws = bootstrap.events
      .filter((e) => e.finished || e.is_current)
      .map((e) => ({ id: e.id, name: e.name, isCurrent: e.is_current }));

    return ok({
      gameweekId: gw,
      totalMembers: memberships.length,
      managers,
      popularIns,
      popularOuts,
      availableGws,
    });
  } catch (err) {
    return failFromError(err);
  }
}
