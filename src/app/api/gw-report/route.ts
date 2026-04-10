import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export const dynamic = "force-dynamic";

interface ManagerInput {
  managerId: number;
  displayName: string;
  teamName: string;
  gameweekPoints: number;
  rankChange: number;
  chipUsed: string | null;
}

interface ReportRequest {
  gameweekId: number;
  orgAverageGwPoints: number;
  globalAverageGwPoints: number;
  managers: ManagerInput[];
}

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
};

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 501 });
  }

  const body = (await req.json()) as ReportRequest;
  const { gameweekId, orgAverageGwPoints, globalAverageGwPoints, managers } = body;

  const managerLines = managers
    .map((m, i) => {
      const vsOrg = m.gameweekPoints - orgAverageGwPoints;
      const vsGlobal = m.gameweekPoints - globalAverageGwPoints;
      const chip = m.chipUsed ? (CHIP_LABELS[m.chipUsed] ?? m.chipUsed) : null;
      const rankStr =
        m.rankChange > 0 ? `moved up ${m.rankChange} place(s)`
        : m.rankChange < 0 ? `dropped ${Math.abs(m.rankChange)} place(s)`
        : "stayed the same position";
      return `${i + 1}. [managerId:${m.managerId}] ${m.displayName} (team: "${m.teamName}") — ${m.gameweekPoints} pts, ${vsOrg >= 0 ? "+" : ""}${vsOrg} vs org avg, ${vsGlobal >= 0 ? "+" : ""}${vsGlobal} vs global avg, ${rankStr} in the table${chip ? `, played ${chip}` : ""}`;
    })
    .join("\n");

  const prompt = `You are writing the internal GW${gameweekId} FPL Performance Report for an organisation called EnergyOne — an energy trading software company. All the managers listed below are colleagues who work there.

Context:
- Org average this GW: ${orgAverageGwPoints} pts
- Global FPL average this GW: ${globalAverageGwPoints} pts

Managers (ranked by GW points, best first):
${managerLines}

Write a short, punchy, funny one-to-two sentence verdict for EACH manager. Rules:
- Write in the THIRD PERSON — these are updates about each person to their colleagues, not messages to the person themselves. Never use "you" or "your"
- Use their first name and reference their team name naturally
- Use energy trading or software development humour (e.g. gas spreads, hedging, P&L, Jira tickets, sprints, deployments, standups, incident reports, pipeline capacity, etc.)
- Every verdict must be noticeably different — vary the tone, the analogy, and the structure. Do NOT reuse the same metaphor or sentence pattern for different managers
- Verdicts for high scorers should be triumphant or smugly congratulatory; for low scorers, gently brutal; for mid-table, wryly observational
- If someone used a chip, reference it
- Keep each verdict to 1–2 sentences max

Respond with ONLY a valid JSON object in exactly this shape, no markdown, no extra text. Use the exact managerId values from the [managerId:...] tags above:
{"verdicts": [{"managerId": <number>, "verdict": "<string>"}, ...]}`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 1,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: { managerId: number; verdict: string }[];
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      // Accept {"verdicts":[...]}, {"managers":[...]}, a bare array, or any wrapper
      if (Array.isArray(obj)) {
        parsed = obj as typeof parsed;
      } else {
        const arr = Object.values(obj).find((v) => Array.isArray(v));
        if (!arr) throw new Error("No array found in response");
        parsed = arr as typeof parsed;
      }
    } catch (parseErr) {
      console.error("Parse error. Raw response:", raw, parseErr);
      return NextResponse.json({ error: "Failed to parse response", raw }, { status: 500 });
    }

    return NextResponse.json({ verdicts: parsed });
  } catch (err) {
    console.error("Groq error:", err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
