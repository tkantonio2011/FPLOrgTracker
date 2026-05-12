/**
 * League-scoped pre-deadline horoscope generator. Madame FPL reads the next
 * GW's omens for each league member based on their recent form, league rank,
 * and remaining chips. Replaces the legacy `/api/horoscope` route which
 * carried energy-industry-specific archetype names.
 */

import type { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { fetchEntryHistory } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseBody, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SIGNS = [
  { name: "The Comet",       emoji: "☄️" }, // blazes bright, burns out fast
  { name: "The Eclipse",     emoji: "🌑" }, // disappears when it matters most
  { name: "The Anchor",      emoji: "⚓" }, // slow, steady, zero charisma
  { name: "The Tempest",     emoji: "⛈️" }, // chaos isn't their fault, apparently
  { name: "The Mirage",      emoji: "🏜️" }, // promises a lot, delivers little
  { name: "The Avalanche",   emoji: "❄️" }, // collapses under pressure
  { name: "The Phoenix",     emoji: "🔥" }, // rises from the ashes occasionally
  { name: "The Pendulum",    emoji: "⚖️" }, // swings between extremes
  { name: "The Architect",   emoji: "📐" }, // master planner, mediocre executor
  { name: "The Mercenary",   emoji: "🗡️" }, // loyalty is for losers
  { name: "The Magpie",      emoji: "🪞" }, // collects shiny differentials
  { name: "The Lighthouse",  emoji: "🗼" }, // guides others, never moves itself
];

const CHIP_NAMES: Record<string, string> = {
  wildcard: "Wildcard",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
};

const managerSchema = z.object({
  managerId: z.number().int().positive(),
  displayName: z.string(),
  teamName: z.string(),
  totalPoints: z.number().int(),
  leagueRank: z.number().int().positive(),
  chipUsed: z.string().nullable(),
});

const bodySchema = z.object({
  gameweekId: z.number().int().min(1).max(38),
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
    const { gameweekId, managers } = body;
    const nextGw = gameweekId + 1;

    // Enrich each manager with recent-form scores and remaining chips.
    const enriched = await Promise.allSettled(
      managers.map(async (m) => {
        const sign = SIGNS[m.managerId % 12];
        try {
          const history = await fetchEntryHistory(m.managerId);
          const played = history.current.filter((e) => e.event <= gameweekId);
          const recentScores = played.slice(-3).map((e) => e.points);
          const chipsPlayed = history.chips.map((c) => c.name);
          const allChips = ["wildcard", "bboost", "3xc", "freehit"] as const;
          const chipsLeft = allChips
            .filter((c) => !chipsPlayed.includes(c))
            .map((c) => CHIP_NAMES[c]);
          return {
            ...m,
            sign: sign.name,
            signEmoji: sign.emoji,
            recentScores,
            chipsLeft,
            activeChip: m.chipUsed,
          };
        } catch {
          return {
            ...m,
            sign: sign.name,
            signEmoji: sign.emoji,
            recentScores: [] as number[],
            chipsLeft: [] as string[],
            activeChip: m.chipUsed,
          };
        }
      }),
    );

    const enrichedManagers = enriched
      .filter((r): r is PromiseFulfilledResult<{
        managerId: number;
        displayName: string;
        teamName: string;
        totalPoints: number;
        leagueRank: number;
        chipUsed: string | null;
        sign: string;
        signEmoji: string;
        recentScores: number[];
        chipsLeft: string[];
        activeChip: string | null;
      }> => r.status === "fulfilled")
      .map((r) => r.value);

    const managerLines = enrichedManagers
      .map((m, i) => {
        const scores =
          m.recentScores.length > 0
            ? `last 3 GW scores: ${m.recentScores.join(", ")}`
            : "no recent score data";
        const chips =
          m.chipsLeft.length > 0
            ? `chips still available: ${m.chipsLeft.join(", ")}`
            : "all chips spent";
        const active = m.activeChip
          ? ` · played ${CHIP_NAMES[m.activeChip] ?? m.activeChip} this GW`
          : "";
        return `${i + 1}. ${m.displayName} ("${m.teamName}") | sign: ${m.sign} ${m.signEmoji} | league rank: ${m.leagueRank}/${managers.length} | season pts: ${m.totalPoints}${active} | ${scores} | ${chips}`;
      })
      .join("\n");

    const prompt = `You are Madame FPL — a theatrical, darkly comic oracle writing pre-deadline horoscopes for fantasy football managers in a private mini-league. Instead of zodiac signs, each manager is assigned a dramatic archetype (e.g. "The Comet", "The Tempest", "The Phoenix"). Your readings blend mystical prophecy with cold FPL statistics and a wry, generic financial-markets sensibility (spreads, hedges, settlement, intrinsic value). Think a trading-floor analyst who also reads tarot cards.

GW${nextGw} Pre-Deadline Oracle (based on data through GW${gameweekId}):
${managerLines}

For each manager write EXACTLY ONE prediction of 2-3 sentences. Rules:
- Open by invoking their archetype name (e.g. "As a Comet, you burn brightest under pressure..." or "The Tempest in you sees no personal responsibility in those recent scores of...")
- Blend mystical prophecy with FPL stats and generic financial jargon: recent scores are "settlement figures", a chip is "a strategic reserve", being last means "trading at a discount to intrinsic value"
- Calibrate tone: top manager = smug market dominance; bottom manager = dark omens, negative spreads, "the cosmos is against you"; mid-table = sideways drift, "no clear signal"
- If chips remain, reference them as untapped capacity or a secret weapon in reserve
- Include at least ONE actual number from their stats
- 2-3 sentences maximum. Punchy, specific, funny. Do NOT mention any specific industry.

Return ONLY valid JSON — no markdown, no extra text:
{"horoscopes":[{"managerId":<number>,"sign":"<name>","signEmoji":"<emoji>","prediction":"<2-3 sentences>"}]}`;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 1.1,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as {
      horoscopes?: Array<{
        managerId: number;
        sign: string;
        signEmoji: string;
        prediction: string;
      }>;
    };

    if (!parsed.horoscopes || parsed.horoscopes.length === 0) {
      return fail("Malformed AI response", 500);
    }

    // Re-pin managerId/sign/signEmoji by position — Groq sometimes mangles
    // them in the JSON output (HTML-entity-encoded emoji, off-by-one numbering).
    const horoscopes = parsed.horoscopes.map((h, i) => ({
      ...h,
      managerId: enrichedManagers[i]?.managerId ?? h.managerId,
      sign: enrichedManagers[i]?.sign ?? h.sign,
      signEmoji: enrichedManagers[i]?.signEmoji ?? h.signEmoji,
    }));

    return ok({ horoscopes, nextGw });
  } catch (err) {
    return failFromError(err);
  }
}
