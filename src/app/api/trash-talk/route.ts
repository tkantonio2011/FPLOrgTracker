import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export const dynamic = "force-dynamic";

interface TrashTalkRequest {
  currentGw: number;
  managerA: { displayName: string; teamName: string; totalPoints: number };
  managerB: { displayName: string; teamName: string; totalPoints: number };
  summary: {
    winsA: number;
    winsB: number;
    draws: number;
    netPtsA: number;
    avgMargin: number;
    longestStreakA: number;
    longestStreakB: number;
    currentStreakHolder: "A" | "B" | "draw" | null;
    currentStreak: number;
    biggestWinA: { gw: number; margin: number } | null;
    biggestWinB: { gw: number; margin: number } | null;
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 501 });
  }

  let body: TrashTalkRequest;
  try {
    body = (await req.json()) as TrashTalkRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { currentGw, managerA: a, managerB: b, summary: s } = body;

  const fnA = a.displayName.split(" ")[0];
  const fnB = b.displayName.split(" ")[0];

  const totalGws   = s.winsA + s.winsB + s.draws;
  const aLeads     = s.winsA > s.winsB;
  const bLeads     = s.winsB > s.winsA;
  const isLevel    = s.winsA === s.winsB;
  const netAbs     = Math.abs(s.netPtsA);
  const netLeader  = s.netPtsA > 0 ? fnA : fnB;
  const streakLine = s.currentStreakHolder && s.currentStreak >= 2
    ? `${s.currentStreakHolder === "A" ? fnA : fnB} is on a ${s.currentStreak}-GW winning streak`
    : null;

  const context = [
    `Gameweek: GW${currentGw}`,
    `${fnA} ("${a.teamName}") vs ${fnB} ("${b.teamName}")`,
    `H2H record: ${fnA} ${s.winsA}W–${s.winsB}L–${s.draws}D vs ${fnB} (${totalGws} GWs played)`,
    aLeads  ? `${fnA} leads the head-to-head` :
    bLeads  ? `${fnB} leads the head-to-head` :
              `They are exactly level head-to-head`,
    netAbs > 0 ? `${netLeader} leads on cumulative pts by ${netAbs} pts` : `Level on cumulative pts`,
    `Avg winning margin: ${s.avgMargin} pts`,
    s.longestStreakA > 0 ? `${fnA}'s longest win streak: ${s.longestStreakA} GWs` : null,
    s.longestStreakB > 0 ? `${fnB}'s longest win streak: ${s.longestStreakB} GWs` : null,
    streakLine,
    s.biggestWinA ? `${fnA}'s biggest win: GW${s.biggestWinA.gw} by ${s.biggestWinA.margin} pts` : null,
    s.biggestWinB ? `${fnB}'s biggest win: GW${s.biggestWinB.gw} by ${s.biggestWinB.margin} pts` : null,
    `Season totals: ${fnA} ${a.totalPoints} pts · ${fnB} ${b.totalPoints} pts`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are writing the pre-fight weigh-in trash talk for a fantasy football head-to-head rivalry at EnergyOne, an energy trading company. Think Muhammad Ali vs Joe Frazier — but for FPL.

H2H Context:
${context}

Generate two one-liner boxing weigh-in quotes — one from each manager's "corner". Each quote is exactly ONE punchy sentence said directly to the opponent (use "you" and "I"). Tone: confident, trash-talky, funny, sports banter. Calibrate the confidence:
- The leader should be smug and specific about their edge
- The trailer should be defiant, dismissive, or in denial
- If they're level, both should be equally cocky
- Weave in energy trading / software metaphors occasionally (but not mandatory)
- Reference at least one specific stat (wins, streak, pts gap, biggest win) in each quote

Return ONLY valid JSON with exactly this structure — no markdown, no extra text:
{"quoteA": "...", "quoteB": "..."}`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model:           "llama-3.1-8b-instant",
      messages:        [{ role: "user", content: prompt }],
      temperature:     1.2,
      max_tokens:      200,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as { quoteA?: string; quoteB?: string };

    if (!parsed.quoteA || !parsed.quoteB) {
      return NextResponse.json({ error: "Malformed AI response" }, { status: 500 });
    }

    return NextResponse.json({ quoteA: parsed.quoteA, quoteB: parsed.quoteB });
  } catch (err) {
    console.error("[POST /api/trash-talk]", err);
    return NextResponse.json({ error: "Failed to generate trash talk" }, { status: 500 });
  }
}
