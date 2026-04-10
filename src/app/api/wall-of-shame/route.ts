import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchEntryTransfers,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export interface ShameRecord {
  id: string;
  trophy: string;
  subtitle: string;
  icon: string;
  winner: {
    managerId: number;
    displayName: string;
    teamName: string;
  };
  stat: string;
  detail: string;
}

export interface WallOfShameResponse {
  records: ShameRecord[];
  currentGw: number;
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
    const playerName = new Map(bootstrap.elements.map((e) => [e.id, e.web_name]));

    // Fetch all histories + transfers in parallel
    const memberData = await Promise.all(
      org.members.map(async (m) => {
        const [history, transfers] = await Promise.all([
          fetchEntryHistory(m.managerId),
          fetchEntryTransfers(m.managerId),
        ]);
        return { member: m, history, transfers };
      })
    );

    // All played GWs
    const playedGws = Array.from(
      new Set(
        memberData.flatMap(({ history }) =>
          history.current.map((e) => e.event).filter((gw) => gw <= currentGw)
        )
      )
    ).sort((a, b) => a - b);

    if (playedGws.length === 0) {
      return NextResponse.json({ records: [], currentGw });
    }

    // Live pts for every played GW
    const liveByGw = new Map<number, Map<number, number>>();
    await Promise.all(
      playedGws.map(async (gw) => {
        const live = await fetchLiveGw(gw);
        liveByGw.set(gw, new Map(live.elements.map((el) => [el.id, el.stats.total_points])));
      })
    );

    // Captain picks for every member × GW
    const captainByMemberGw = new Map<number, Map<number, number>>();
    for (const { member } of memberData) captainByMemberGw.set(member.managerId, new Map());

    await Promise.all(
      memberData.flatMap(({ member }) =>
        playedGws.map(async (gw) => {
          try {
            const picks = await fetchEntryPicks(member.managerId, gw);
            const captain = picks.picks.find((p) => p.is_captain);
            if (captain) captainByMemberGw.get(member.managerId)!.set(gw, captain.element);
          } catch {
            // GW not played by this manager — skip
          }
        })
      )
    );

    // ── Compute records ─────────────────────────────────────────────────────────

    type CandidateBase = { managerId: number; displayName: string; teamName: string };

    // 1. Most bench pts all season
    const benchTotals: (CandidateBase & { total: number })[] = memberData.map(({ member, history }) => ({
      managerId: member.managerId,
      displayName: member.displayName ?? `Manager ${member.managerId}`,
      teamName: member.teamName ?? "",
      total: history.current
        .filter((e) => e.event <= currentGw)
        .reduce((s, e) => s + e.points_on_bench, 0),
    }));
    const benchKing = benchTotals.reduce((a, b) => (b.total > a.total ? b : a));

    // 2. Most transfer hit cost (total pts paid)
    const hitTotals: (CandidateBase & { total: number; count: number })[] = memberData.map(({ member, history }) => {
      const played = history.current.filter((e) => e.event <= currentGw);
      return {
        managerId: member.managerId,
        displayName: member.displayName ?? `Manager ${member.managerId}`,
        teamName: member.teamName ?? "",
        total: played.reduce((s, e) => s + e.event_transfers_cost, 0),
        count: played.filter((e) => e.event_transfers_cost > 0).length,
      };
    });
    const masochist = hitTotals.reduce((a, b) => (b.total > a.total ? b : a));

    // 3. Lowest single GW score
    type LowestScore = CandidateBase & { pts: number; gw: number };
    let lowestScore: LowestScore | null = null;
    for (const { member, history } of memberData) {
      for (const entry of history.current) {
        if (entry.event > currentGw) continue;
        if (!lowestScore || entry.points < lowestScore.pts) {
          lowestScore = {
            managerId: member.managerId,
            displayName: member.displayName ?? `Manager ${member.managerId}`,
            teamName: member.teamName ?? "",
            pts: entry.points,
            gw: entry.event,
          };
        }
      }
    }

    // 4. Worst single-GW bench waste
    type WorstBench = CandidateBase & { pts: number; gw: number };
    let worstBench: WorstBench | null = null;
    for (const { member, history } of memberData) {
      for (const entry of history.current) {
        if (entry.event > currentGw) continue;
        if (!worstBench || entry.points_on_bench > worstBench.pts) {
          worstBench = {
            managerId: member.managerId,
            displayName: member.displayName ?? `Manager ${member.managerId}`,
            teamName: member.teamName ?? "",
            pts: entry.points_on_bench,
            gw: entry.event,
          };
        }
      }
    }

    // 5. Worst captain blank — captain scored fewest pts in a single GW
    type CaptainBlank = CandidateBase & { pts: number; gw: number; playerName: string };
    let worstCaptainBlank: CaptainBlank | null = null;
    for (const { member } of memberData) {
      const gwMap = captainByMemberGw.get(member.managerId)!;
      for (const [gw, captainId] of Array.from(gwMap)) {
        const pts = liveByGw.get(gw)?.get(captainId) ?? 0;
        if (!worstCaptainBlank || pts < worstCaptainBlank.pts) {
          worstCaptainBlank = {
            managerId: member.managerId,
            displayName: member.displayName ?? `Manager ${member.managerId}`,
            teamName: member.teamName ?? "",
            pts,
            gw,
            playerName: playerName.get(captainId) ?? `#${captainId}`,
          };
        }
      }
    }

    // 6. Worst individual transfer (lowest net pts: player sold then in-player flopped)
    type BadTransfer = CandidateBase & { net: number; gw: number; inName: string; outName: string; inPts: number; outPts: number };
    let worstTransfer: BadTransfer | null = null;
    for (const { member, transfers } of memberData) {
      for (const t of transfers) {
        if (t.event > currentGw) continue;
        const gwLive = liveByGw.get(t.event);
        const inPts  = gwLive?.get(t.element_in)  ?? 0;
        const outPts = gwLive?.get(t.element_out) ?? 0;
        const net = inPts - outPts;
        if (!worstTransfer || net < worstTransfer.net) {
          worstTransfer = {
            managerId: member.managerId,
            displayName: member.displayName ?? `Manager ${member.managerId}`,
            teamName: member.teamName ?? "",
            net,
            gw: t.event,
            inName:  playerName.get(t.element_in)  ?? `#${t.element_in}`,
            outName: playerName.get(t.element_out) ?? `#${t.element_out}`,
            inPts,
            outPts,
          };
        }
      }
    }

    // ── Assemble records ────────────────────────────────────────────────────────

    const records: ShameRecord[] = [];

    records.push({
      id: "bench-king",
      trophy: "The Bench Warmer",
      subtitle: "Most points left rotting on the bench all season",
      icon: "🛋️",
      winner: { managerId: benchKing.managerId, displayName: benchKing.displayName, teamName: benchKing.teamName },
      stat: `${benchKing.total} pts`,
      detail: `Accumulated across ${playedGws.length} gameweeks of painful selection`,
    });

    records.push({
      id: "masochist",
      trophy: "The Masochist Medal",
      subtitle: "Most points voluntarily handed back to FPL HQ via transfer hits",
      icon: "💸",
      winner: { managerId: masochist.managerId, displayName: masochist.displayName, teamName: masochist.teamName },
      stat: `${masochist.total} pts`,
      detail: `Across ${masochist.count} GW${masochist.count === 1 ? "" : "s"} of self-inflicted punishment`,
    });

    if (lowestScore) {
      records.push({
        id: "wooden-spoon",
        trophy: "The Wooden Spoon",
        subtitle: "Lowest single gameweek score of the season. An achievement of sorts",
        icon: "🥄",
        winner: { managerId: lowestScore.managerId, displayName: lowestScore.displayName, teamName: lowestScore.teamName },
        stat: `${lowestScore.pts} pts`,
        detail: `GW${lowestScore.gw} — a number that should not be spoken aloud`,
      });
    }

    if (worstBench) {
      records.push({
        id: "bonfire",
        trophy: "The Bonfire of Vanities",
        subtitle: "Most points left on the bench in a single gameweek",
        icon: "🔥",
        winner: { managerId: worstBench.managerId, displayName: worstBench.displayName, teamName: worstBench.teamName },
        stat: `${worstBench.pts} pts`,
        detail: `GW${worstBench.gw} — ${worstBench.pts} points watched from the substitutes bench`,
      });
    }

    if (worstCaptainBlank) {
      records.push({
        id: "captain-blank",
        trophy: "The Armband of Doom",
        subtitle: "Worst captain blank — trusted with the armband, delivered nothing",
        icon: "🫡",
        winner: { managerId: worstCaptainBlank.managerId, displayName: worstCaptainBlank.displayName, teamName: worstCaptainBlank.teamName },
        stat: `${worstCaptainBlank.pts} pts`,
        detail: `GW${(worstCaptainBlank as CaptainBlank).gw} — ${(worstCaptainBlank as CaptainBlank).playerName} (C) scored ${worstCaptainBlank.pts}`,
      });
    }

    if (worstTransfer) {
      const wt = worstTransfer as BadTransfer;
      records.push({
        id: "regret",
        trophy: "The Regret Machine",
        subtitle: "Worst individual transfer — sold the hero, bought the villain",
        icon: "😭",
        winner: { managerId: wt.managerId, displayName: wt.displayName, teamName: wt.teamName },
        stat: `${wt.net > 0 ? "+" : ""}${wt.net} pts`,
        detail: `GW${wt.gw} — sold ${wt.outName} (${wt.outPts}pts), bought ${wt.inName} (${wt.inPts}pts)`,
      });
    }

    return NextResponse.json({ records, currentGw });
  } catch (err) {
    console.error("[GET /api/wall-of-shame]", err);
    return NextResponse.json(
      { error: "Failed to compute wall of shame", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
