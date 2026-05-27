/**
 * League-scoped pre-fight trash talk for two managers in a head-to-head
 * rivalry. Replaces the legacy `/api/trash-talk` which accepted
 * unauthenticated POSTs.
 */

import type { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseBody, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const managerSchema = z.object({
  displayName: z.string(),
  teamName: z.string(),
  totalPoints: z.number().int(),
});

const summarySchema = z.object({
  winsA: z.number().int().nonnegative(),
  winsB: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  netPtsA: z.number().int(),
  avgMargin: z.number(),
  longestStreakA: z.number().int().nonnegative(),
  longestStreakB: z.number().int().nonnegative(),
  currentStreakHolder: z.enum(["A", "B", "draw"]).nullable(),
  currentStreak: z.number().int().nonnegative(),
  biggestWinA: z.object({ gw: z.number().int(), margin: z.number().int() }).nullable(),
  biggestWinB: z.object({ gw: z.number().int(), margin: z.number().int() }).nullable(),
});

const bodySchema = z.object({
  currentGw: z.number().int().min(1).max(38),
  managerA: managerSchema,
  managerB: managerSchema,
  summary: summarySchema,
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
    const { currentGw, managerA: a, managerB: b, summary: s } = body;

    const fnA = a.displayName.split(" ")[0];
    const fnB = b.displayName.split(" ")[0];

    const totalGws = s.winsA + s.winsB + s.draws;
    const aLeads = s.winsA > s.winsB;
    const bLeads = s.winsB > s.winsA;
    const netAbs = Math.abs(s.netPtsA);
    const netLeader = s.netPtsA > 0 ? fnA : fnB;
    const streakLine =
      s.currentStreakHolder && s.currentStreak >= 2
        ? `${s.currentStreakHolder === "A" ? fnA : fnB} is on a ${s.currentStreak}-GW winning streak`
        : null;

    const context = [
      `Gameweek: GW${currentGw}`,
      `${fnA} ("${a.teamName}") vs ${fnB} ("${b.teamName}")`,
      `H2H record: ${fnA} ${s.winsA}W–${s.winsB}L–${s.draws}D vs ${fnB} (${totalGws} GWs played)`,
      aLeads
        ? `${fnA} leads the head-to-head`
        : bLeads
          ? `${fnB} leads the head-to-head`
          : `They are exactly level head-to-head`,
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

    const prompt = `You are writing the pre-fight weigh-in trash talk for a fantasy football head-to-head rivalry inside a private mini-league. Think Muhammad Ali vs Joe Frazier — but for FPL.

H2H Context:
${context}

Generate two one-liner boxing weigh-in quotes — one from each manager's "corner". Each quote is exactly ONE punchy sentence said directly to the opponent (use "you" and "I"). Tone: confident, trash-talky, funny, sports banter. Calibrate the confidence:
- The leader should be smug and specific about their edge
- The trailer should be defiant, dismissive, or in denial
- If they're level, both should be equally cocky
- Office / financial-markets metaphors are fine but not required — keep them generic (spreads, P&L, sprints) rather than industry-specific
- Reference at least one specific stat (wins, streak, pts gap, biggest win) in each quote

Return ONLY valid JSON with exactly this structure — no markdown, no extra text:
{"quoteA": "...", "quoteB": "..."}`;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 1.2,
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as { quoteA?: string; quoteB?: string };

    if (!parsed.quoteA || !parsed.quoteB) {
      return fail("Malformed AI response", 500);
    }

    return ok({ quoteA: parsed.quoteA, quoteB: parsed.quoteB });
  } catch (err) {
    return failFromError(err);
  }
}
