import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { fetchEntryHistory } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

const SIGNS = [
  { name: "The Gas Peaker",         emoji: "🔥" }, // runs hot only when it counts
  { name: "The Negative Price",     emoji: "📉" }, // costs money to exist
  { name: "The Baseload Beast",     emoji: "⚙️" }, // slow, reliable, zero charisma
  { name: "The Force Majeure",      emoji: "⛈️" }, // never their fault, ever
  { name: "The Curtailment",        emoji: "✂️" }, // shut down at the worst moment
  { name: "The Short Squeeze",      emoji: "💸" }, // panics under pressure
  { name: "The Interconnector",     emoji: "🔌" }, // lives by others' decisions
  { name: "The Imbalance Settler",  emoji: "⚖️" }, // perpetually out of balance
  { name: "The Day-Ahead Dreamer",  emoji: "📅" }, // plans everything, delivers nothing
  { name: "The Merchant Plant",     emoji: "🏭" }, // pure mercenary, no loyalty
  { name: "The Arbitrageur",        emoji: "💱" }, // finds value where others see chaos
  { name: "The Balancing Mechanism",emoji: "🎛️" }, // last resort, called up in desperation
];

const CHIP_NAMES: Record<string, string> = {
  wildcard: "Wildcard",
  bboost:   "Bench Boost",
  "3xc":    "Triple Captain",
  freehit:  "Free Hit",
};

interface HoroscopeRequest {
  gameweekId: number;
  managers: Array<{
    managerId: number;
    displayName: string;
    teamName: string;
    totalPoints: number;
    orgRank: number;
    chipUsed: string | null;
  }>;
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 501 });
  }

  let body: HoroscopeRequest;
  try {
    body = (await req.json()) as HoroscopeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { gameweekId, managers } = body;
  const nextGw = gameweekId + 1;

  // Enrich each manager with form scores + chip status from FPL history
  const enriched = await Promise.allSettled(
    managers.map(async (m) => {
      const sign = SIGNS[m.managerId % 12];
      try {
        const history = await fetchEntryHistory(m.managerId);
        const played = history.current.filter((e) => e.event <= gameweekId);
        const recentScores = played.slice(-3).map((e) => e.points);
        const chipsPlayed = history.chips.map((c) => c.name);
        const allChips = ["wildcard", "bboost", "3xc", "freehit"] as const;
        const chipsLeft = allChips.filter((c) => !chipsPlayed.includes(c)).map((c) => CHIP_NAMES[c]);
        return { ...m, sign: sign.name, signEmoji: sign.emoji, recentScores, chipsLeft, activeChip: m.chipUsed };
      } catch {
        return { ...m, sign: sign.name, signEmoji: sign.emoji, recentScores: [] as number[], chipsLeft: [] as string[], activeChip: m.chipUsed };
      }
    })
  );

  const enrichedManagers = enriched
    .filter((r): r is PromiseFulfilledResult<{
      managerId: number; displayName: string; teamName: string;
      totalPoints: number; orgRank: number; chipUsed: string | null;
      sign: string; signEmoji: string; recentScores: number[];
      chipsLeft: string[]; activeChip: string | null;
    }> => r.status === "fulfilled")
    .map((r) => r.value);

  const managerLines = enrichedManagers.map((m, i) => {
    const scores = m.recentScores.length > 0 ? `last 3 GW scores: ${m.recentScores.join(", ")}` : "no recent score data";
    const chips  = m.chipsLeft.length > 0 ? `chips still available: ${m.chipsLeft.join(", ")}` : "all chips spent";
    const active = m.activeChip ? ` · played ${CHIP_NAMES[m.activeChip] ?? m.activeChip} this GW` : "";
    return `${i + 1}. ${m.displayName} ("${m.teamName}") | sign: ${m.sign} ${m.signEmoji} | org rank: ${m.orgRank}/${managers.length} | season pts: ${m.totalPoints}${active} | ${scores} | ${chips}`;
  }).join("\n");

  const prompt = `You are Madame FPL — a theatrical, darkly comic oracle writing pre-deadline horoscopes for fantasy football managers at EnergyOne, an energy trading company. Instead of zodiac signs, each manager is assigned an energy trading archetype (e.g. "The Gas Peaker", "The Force Majeure"). Your readings blend mystical prophecy language with energy market jargon and cold FPL statistics. Think a trading floor analyst who also reads tarot cards.

GW${nextGw} Pre-Deadline Oracle (based on data through GW${gameweekId}):
${managerLines}

For each manager write EXACTLY ONE prediction of 2-3 sentences. Rules:
- Open by invoking their energy archetype name (e.g. "As a Gas Peaker, you burn brightest under pressure..." or "The Force Majeure in you sees no personal responsibility in those recent scores of...")
- Blend energy trading jargon with FPL mysticism: recent scores are "settlement figures", a chip is "a strategic reserve", being last means "trading at a discount to intrinsic value"
- Calibrate tone: top manager = smug market dominance; bottom manager = dark omens, negative spreads, "the grid is against you"; mid-table = sideways market, "no clear signal"
- If chips remain, reference them as untapped capacity or a secret weapon in reserve
- Include at least ONE actual number from their stats
- 2-3 sentences maximum. Punchy, specific, funny.

Return ONLY valid JSON — no markdown, no extra text:
{"horoscopes":[{"managerId":<number>,"sign":"<name>","signEmoji":"<emoji>","prediction":"<2-3 sentences>"}]}`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model:           "llama-3.1-8b-instant",
      messages:        [{ role: "user", content: prompt }],
      temperature:     1.1,
      max_tokens:      1200,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as {
      horoscopes?: Array<{ managerId: number; sign: string; signEmoji: string; prediction: string }>;
    };

    if (!parsed.horoscopes || parsed.horoscopes.length === 0) {
      return NextResponse.json({ error: "Malformed AI response" }, { status: 500 });
    }

    // Groq tends to number managers 1..N and may mangle Unicode symbols as HTML
    // entities. Re-pin managerId, sign, and signEmoji from our own data by position.
    const horoscopes = parsed.horoscopes.map((h, i) => ({
      ...h,
      managerId: enrichedManagers[i]?.managerId ?? h.managerId,
      sign:      enrichedManagers[i]?.sign      ?? h.sign,
      signEmoji: enrichedManagers[i]?.signEmoji ?? h.signEmoji,
    }));

    return NextResponse.json({ horoscopes, nextGw });
  } catch (err) {
    console.error("[POST /api/horoscope]", err);
    return NextResponse.json({ error: "Failed to generate horoscope" }, { status: 500 });
  }
}
