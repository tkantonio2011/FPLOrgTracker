import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryPicks,
  fetchEntryHistory,
  fetchLiveGw,
} from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

interface TribunalRequest {
  gameweekId: number;
  managerId: number;
  managerName: string;
  teamName: string;
  gwScore: number;
  orgAvg: number;
  rankChange: number;
  chipUsed: string | null;
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 501 });
  }

  let body: TribunalRequest;
  try {
    body = (await req.json()) as TribunalRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { gameweekId, managerId, managerName, teamName, gwScore, orgAvg, rankChange, chipUsed } = body;

  try {
    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org) return NextResponse.json({ error: "ORG_NOT_CONFIGURED" }, { status: 404 });

    const bootstrap = await fetchBootstrap();
    const playersById = new Map(bootstrap.elements.map((e) => [e.id, e]));

    // ── Captain name + pts ────────────────────────────────────────────────────
    let captainName = "their captain";
    let captainPts: number | null = null;

    try {
      const picks = await fetchEntryPicks(managerId, gameweekId);
      const captainPick = picks.picks.find((p) => p.is_captain);
      if (captainPick) {
        const player = playersById.get(captainPick.element);
        captainName = player
          ? `${player.first_name} ${player.second_name}`
          : "their captain";

        // Live GW data for captain's actual score
        try {
          const liveGw = await fetchLiveGw(gameweekId);
          const liveEl = liveGw.elements.find((e) => e.id === captainPick.element);
          if (liveEl) captainPts = liveEl.stats.total_points;
        } catch {
          // Live data unavailable — proceed without pts
        }
      }
    } catch {
      // Picks unavailable (private team or future GW) — proceed without captain info
    }

    // ── Bench pts + transfer cost for this GW ────────────────────────────────
    let benchPts: number | null = null;
    let hitCost: number | null = null;
    let seasonTotal: number | null = null;
    let orgSize = org.members.length;

    try {
      const history = await fetchEntryHistory(managerId);
      const gwEntry = history.current.find((e) => e.event === gameweekId);
      if (gwEntry) {
        benchPts = gwEntry.points_on_bench;
        hitCost  = gwEntry.event_transfers_cost;
        seasonTotal = gwEntry.total_points;
      }
    } catch {
      // History unavailable — proceed without
    }

    // ── Build context ─────────────────────────────────────────────────────────
    const firstName = managerName.split(" ")[0];
    const ptsDiff   = gwScore - orgAvg;
    const chipLine  = chipUsed ? `Chip played this GW: ${chipUsed}` : "No chip played";

    const contextLines = [
      `Manager: ${managerName} ("${teamName}")`,
      `GW${gameweekId} score: ${gwScore} pts — BOTTOM of the org (org average: ${orgAvg} pts, gap: ${ptsDiff} pts)`,
      captainPts !== null
        ? `Captain: ${captainName} — scored ${captainPts} pts (captain gets ${captainPts * 2} pts after multiplier)`
        : `Captain: ${captainName}`,
      benchPts !== null ? `Bench pts left on the bench this GW: ${benchPts}` : null,
      hitCost && hitCost > 0 ? `Transfer hit cost paid this GW: −${hitCost} pts` : "No transfer hits taken",
      chipLine,
      rankChange < 0 ? `League rank change: dropped ${Math.abs(rankChange)} place${Math.abs(rankChange) !== 1 ? "s" : ""}` :
        rankChange > 0 ? `League rank change: climbed ${rankChange} place${rankChange !== 1 ? "s" : ""}` :
        "League rank: unchanged",
      seasonTotal !== null ? `Season total so far: ${seasonTotal} pts` : null,
      `Org size: ${orgSize} managers`,
    ]
      .filter(Boolean)
      .join("\n");

    // ── Groq prompt ───────────────────────────────────────────────────────────
    const prompt = `You are writing a fictional post-GW FPL press conference for a private fantasy football mini-league at EnergyOne, an energy trading software company.

${firstName} has just finished BOTTOM of the org this gameweek. They must face three pointed questions from Malcolm Sharp, senior correspondent at The FPL Gazette.

Factual context:
${contextLines}

Generate a JSON object with EXACTLY this structure:
{
  "intro": "One vivid sentence setting the scene as ${firstName} enters the press conference. Dry, slightly savage. Reference their team name.",
  "qa": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ]
}

Rules for questions:
- Malcolm is polite but absolutely merciless — each question references a specific stat (captain pts, bench waste, gw score vs average, rank drop)
- Questions are short and pointed, like a proper journalist going for the throat

Rules for answers:
- ${firstName} is defensive, rationalising, slightly delusional — classic post-match manager speak
- Sprinkle in energy trading / software metaphors (risk model, hedging, pipeline, Jira, deploys, gas spreads)
- Answers are 2–3 sentences — confident on the surface, crumbling underneath
- Occasionally they contradict themselves between answers

General rules:
- Darkly funny, not cruel — this is affectionate workplace banter
- Output ONLY valid JSON. No markdown fences, no extra text, no trailing commas.`;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model:       "llama-3.1-8b-instant",
      messages:    [{ role: "user", content: prompt }],
      temperature: 1.15,
      max_tokens:  600,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as {
      intro?: string;
      qa?: { question: string; answer: string }[];
    };

    if (!parsed.intro || !Array.isArray(parsed.qa) || parsed.qa.length === 0) {
      return NextResponse.json({ error: "Malformed AI response" }, { status: 500 });
    }

    return NextResponse.json({
      gw:          gameweekId,
      managerId,
      managerName,
      teamName,
      gwScore,
      captainName,
      captainPts,
      intro:       parsed.intro,
      qa:          parsed.qa.slice(0, 3),
    });
  } catch (err) {
    console.error("[POST /api/tribunal]", err);
    return NextResponse.json({ error: "Failed to generate tribunal" }, { status: 500 });
  }
}
