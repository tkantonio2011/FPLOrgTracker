/**
 * League-scoped post-GW performance report — generates per-manager LLM
 * verdicts for the current gameweek. Replaces the legacy `/api/gw-report`
 * which accepted unauthenticated POSTs.
 */

import type { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseBody, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
};

const managerSchema = z.object({
  managerId: z.number().int().positive(),
  displayName: z.string(),
  teamName: z.string(),
  gameweekPoints: z.number().int(),
  rankChange: z.number().int(),
  chipUsed: z.string().nullable(),
});

const bodySchema = z.object({
  gameweekId: z.number().int().min(1).max(38),
  leagueAverageGwPoints: z.number(),
  globalAverageGwPoints: z.number(),
  managers: z.array(managerSchema).min(1),
});

export async function POST(
  req: NextRequest,
  ctx: { params: { leagueId: string } },
) {
  try {
    await requireLeagueMember(req, ctx.params.leagueId);

    if (!process.env.GROQ_API_KEY) {
      return fail("GROQ_API_KEY not configured", 501);
    }

    const body = await parseBody(req, bodySchema);
    const { gameweekId, leagueAverageGwPoints, globalAverageGwPoints, managers } = body;

    const managerLines = managers
      .map((m, i) => {
        const vsLeague = m.gameweekPoints - leagueAverageGwPoints;
        const vsGlobal = m.gameweekPoints - globalAverageGwPoints;
        const chip = m.chipUsed ? CHIP_LABELS[m.chipUsed] ?? m.chipUsed : null;
        const rankStr =
          m.rankChange > 0
            ? `moved up ${m.rankChange} place(s)`
            : m.rankChange < 0
              ? `dropped ${Math.abs(m.rankChange)} place(s)`
              : "stayed the same position";
        return `${i + 1}. [managerId:${m.managerId}] ${m.displayName} (team: "${m.teamName}") — ${m.gameweekPoints} pts, ${vsLeague >= 0 ? "+" : ""}${vsLeague} vs league avg, ${vsGlobal >= 0 ? "+" : ""}${vsGlobal} vs global avg, ${rankStr} in the table${chip ? `, played ${chip}` : ""}`;
      })
      .join("\n");

    const prompt = `You are writing the internal GW${gameweekId} FPL Performance Report for a private fantasy football mini-league. All the managers listed below are members of this league.

Context:
- League average this GW: ${leagueAverageGwPoints} pts
- Global FPL average this GW: ${globalAverageGwPoints} pts

Managers (ranked by GW points, best first):
${managerLines}

Write a short, punchy, funny one-to-two sentence verdict for EACH manager. Rules:
- Write in the THIRD PERSON — these are updates about each person to other league members, not messages to the person themselves. Never use "you" or "your"
- Use their first name and reference their team name naturally
- Use a mix of office and financial-markets humour (e.g. spreads, hedging, P&L, Jira tickets, sprints, deployments, standups, incident reports, pipeline capacity, etc.) — generic enough to land regardless of the reader's industry
- Every verdict must be noticeably different — vary the tone, the analogy, and the structure. Do NOT reuse the same metaphor or sentence pattern for different managers
- Verdicts for high scorers should be triumphant or smugly congratulatory; for low scorers, gently brutal; for mid-table, wryly observational
- If someone used a chip, reference it
- Keep each verdict to 1–2 sentences max

Respond with ONLY a valid JSON object in exactly this shape, no markdown, no extra text. Use the exact managerId values from the [managerId:...] tags above:
{"verdicts": [{"managerId": <number>, "verdict": "<string>"}, ...]}`;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 1.0,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as {
      verdicts?: { managerId: number; verdict: string }[];
    };

    if (!parsed.verdicts || parsed.verdicts.length === 0) {
      return fail("Malformed AI response", 500);
    }

    return ok({ verdicts: parsed.verdicts });
  } catch (err) {
    return failFromError(err);
  }
}
