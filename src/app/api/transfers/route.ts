import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryTransfers,
  fetchEntryHistory,
  getCurrentGw,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" },
        { status: 404 }
      );
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);
    const gw = parseInt(searchParams.get("gw") ?? String(currentGw));

    // Player lookup: id → { name, team, elementType }
    const playerMap = new Map(
      bootstrap.elements.map((e) => [
        e.id,
        {
          name: e.web_name,
          team: bootstrap.teams.find((t) => t.id === e.team)?.short_name ?? "???",
          elementType: e.element_type, // 1=GK 2=DEF 3=MID 4=FWD
        },
      ])
    );

    // Fetch all members' transfers + history in parallel
    const memberResults = await Promise.allSettled(
      org.members.map(async (m) => {
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
      })
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
        }> => r.status === "fulfilled"
      )
      .map((r) => r.value);

    // Tally how many org managers transferred each player IN and OUT
    const inCount = new Map<number, { name: string; team: string; elementType: number; managers: string[] }>();
    const outCount = new Map<number, { name: string; team: string; elementType: number; managers: string[] }>();

    for (const m of managers) {
      for (const t of m.transfers) {
        // IN
        const inEntry = inCount.get(t.playerIn.id) ?? { ...t.playerIn, managers: [] };
        inEntry.managers.push(m.displayName);
        inCount.set(t.playerIn.id, inEntry);
        // OUT
        const outEntry = outCount.get(t.playerOut.id) ?? { ...t.playerOut, managers: [] };
        outEntry.managers.push(m.displayName);
        outCount.set(t.playerOut.id, outEntry);
      }
    }

    // Sort by most popular
    const popularIns = Array.from(inCount.entries())
      .map(([id, d]) => ({ playerId: id, name: d.name, team: d.team, elementType: d.elementType, count: d.managers.length, managers: d.managers }))
      .sort((a, b) => b.count - a.count);

    const popularOuts = Array.from(outCount.entries())
      .map(([id, d]) => ({ playerId: id, name: d.name, team: d.team, elementType: d.elementType, count: d.managers.length, managers: d.managers }))
      .sort((a, b) => b.count - a.count);

    // Gameweeks available = finished + current
    const availableGws = bootstrap.events
      .filter((e) => e.finished || e.is_current)
      .map((e) => ({ id: e.id, name: e.name, isCurrent: e.is_current }));

    return NextResponse.json({
      gameweekId: gw,
      totalMembers: org.members.length,
      managers,
      popularIns,
      popularOuts,
      availableGws,
    });
  } catch (err) {
    console.error("[GET /api/transfers]", err);
    return NextResponse.json(
      { error: "Failed to fetch transfers", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
