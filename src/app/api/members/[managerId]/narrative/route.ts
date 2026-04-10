import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { managerId: string } }
) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 501 });
  }

  const managerId = parseInt(params.managerId, 10);
  if (isNaN(managerId)) {
    return NextResponse.json({ error: "Invalid managerId" }, { status: 400 });
  }

  try {
    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org || org.members.length === 0) {
      return NextResponse.json({ error: "ORG_NOT_CONFIGURED" }, { status: 404 });
    }

    const member = org.members.find((m) => m.managerId === managerId);
    if (!member) {
      return NextResponse.json({ error: "Manager not found" }, { status: 404 });
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);

    // Fetch all members' histories for org context (FPL client caches these)
    const allHistories = await Promise.all(
      org.members.map(async (m) => ({
        member: m,
        history: await fetchEntryHistory(m.managerId),
      }))
    );

    const targetEntry = allHistories.find((h) => h.member.managerId === managerId)!;
    const played = targetEntry.history.current.filter((e) => e.event <= currentGw);

    if (played.length === 0) {
      return NextResponse.json({ narrative: null, gw: currentGw });
    }

    // ── Per-manager stats ────────────────────────────────────────────────────────
    const totalPoints = played[played.length - 1].total_points;
    const avgScore =
      Math.round((played.reduce((s, e) => s + e.points, 0) / played.length) * 10) / 10;
    const bestGw  = played.reduce((b, e) => (e.points > b.points ? e : b), played[0]);
    const worstGw = played.reduce((b, e) => (e.points < b.points ? e : b), played[0]);
    const totalBenchPts  = played.reduce((s, e) => s + e.points_on_bench, 0);
    const totalHitCost   = played.reduce((s, e) => s + e.event_transfers_cost, 0);
    const recentForm     = played.slice(-3)
      .map((e) => `GW${e.event}: ${e.points}`)
      .join(", ");

    const chipsUsed =
      targetEntry.history.chips
        .map((c) => `${CHIP_LABELS[c.name] ?? c.name} (GW${c.event})`)
        .join(", ") || "none";

    // ── Org rank + context ───────────────────────────────────────────────────────
    const orgTotals = allHistories
      .map(({ member: m, history: h }) => {
        const p = h.current.filter((e) => e.event <= currentGw);
        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          total: p[p.length - 1]?.total_points ?? 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    const orgSize   = orgTotals.length;
    const orgRank   = orgTotals.findIndex((m) => m.managerId === managerId) + 1;
    const leader    = orgTotals[0];
    const bottom    = orgTotals[orgTotals.length - 1];

    const ptsGapFromLeader =
      leader.managerId !== managerId ? leader.total - totalPoints : null;
    const ptsAheadOfBottom =
      bottom.managerId !== managerId ? totalPoints - bottom.total : null;

    const orgAvgGwScore =
      Math.round(
        (allHistories.reduce((sum, { history: h }) => {
          const p = h.current.filter((e) => e.event <= currentGw);
          return sum + (p.reduce((s, e) => s + e.points, 0) / (p.length || 1));
        }, 0) /
          orgSize) *
          10
      ) / 10;

    // ── Build context block ──────────────────────────────────────────────────────
    const leaderLine = ptsGapFromLeader != null
      ? `Points behind org leader (${leader.displayName.split(" ")[0]}): ${ptsGapFromLeader} pts`
      : `${member.displayName?.split(" ")[0] ?? "They"} IS the org leader`;

    const bottomLine = ptsAheadOfBottom != null
      ? `Points ahead of last place (${bottom.displayName.split(" ")[0]}): ${ptsAheadOfBottom} pts`
      : `${member.displayName?.split(" ")[0] ?? "They"} IS last place`;

    const contextBlock = [
      `Manager: ${member.displayName ?? `Manager ${managerId}`} ("${member.teamName ?? "Unknown"}")`,
      `Season GW 1–${currentGw} | ${played.length} gameweeks played`,
      `Total points: ${totalPoints} | Org position: ${orgRank} of ${orgSize}`,
      leaderLine,
      bottomLine,
      `Avg GW score: ${avgScore} pts (org avg: ${orgAvgGwScore} pts)`,
      `Best GW: GW${bestGw.event} (${bestGw.points} pts) | Worst GW: GW${worstGw.event} (${worstGw.points} pts)`,
      `Bench pts wasted: ${totalBenchPts} pts`,
      `Transfer hit cost: −${totalHitCost} pts`,
      `Chips used: ${chipsUsed}`,
      `Recent form (last 3 GWs): ${recentForm}`,
    ].join("\n");

    // ── Prompt ───────────────────────────────────────────────────────────────────
    const isTop    = orgRank === 1;
    const isBottom = orgRank === orgSize;
    const positionHint = isTop
      ? "They are currently leading the org — write with smug confidence but hint at the fragility of their position."
      : isBottom
      ? "They are currently bottom of the org — be brutal but almost sympathetic, like a club programme piece on a relegated player."
      : orgRank <= Math.ceil(orgSize / 2)
      ? "They are in the top half but not leading — write with cautious optimism, wry self-awareness."
      : "They are in the lower half — write with the resigned tone of a mid-table side that talks itself into believing a late run is possible.";

    const prompt = `You are writing the "Season So Far" entry in the official EnergyOne FPL Programme — an internal FPL publication for colleagues at EnergyOne, an energy trading software company. This is the season profile for one of the ${orgSize} managers in their private mini-league.

Stats:
${contextBlock}

Tone guidance: ${positionHint}

Write a single paragraph (3–5 sentences) in the style of a football match programme player biography — authoritative, slightly dramatic, but quietly savage. Rules:
- Write in the THIRD PERSON — never "you" or "your"
- Use their first name naturally; reference their team name at least once
- Weave in energy trading or software humour (gas spreads, hedging, P&L, Jira, sprints, pipelines, incident reports, etc.)
- Reference at least two specific numbers from the stats above (points wasted on bench, hit cost, GW scores, pts behind leader, etc.)
- One sentence should be purely factual setup; the next should land the twist or the joke
- Do not end with generic motivation or future hope — end on an observation about the present situation
- Output ONLY the paragraph — no title, no heading, no markdown, no surrounding quotes`;

    // ── Groq call ────────────────────────────────────────────────────────────────
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 1.1,
      max_tokens: 320,
    });

    const narrative = completion.choices[0]?.message?.content?.trim() ?? null;
    return NextResponse.json({ narrative, gw: currentGw, managerId });
  } catch (err) {
    console.error("[GET /api/members/[managerId]/narrative]", err);
    return NextResponse.json({ error: "Failed to generate narrative" }, { status: 500 });
  }
}
