import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchBootstrap,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchLiveGw,
  getCurrentGw,
} from "@/lib/fpl/client";
import { isAdminRequest } from "@/lib/admin-auth";
import { isSmtpConfigured, sendDigestEmail } from "@/lib/email/sender";
import Groq from "groq-sdk";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManagerDigestData {
  managerId: number;
  displayName: string;
  teamName: string;
  gwScore: number;
  totalPoints: number;
  rank: number;
  prevRank: number;
  rankChange: number;
  captainName: string;
  captainPts: number;
  benchPts: number;
  chipUsed: string | null;
}

interface GroqDigest {
  subjectSubtitle: string;
  intro: string;
  managers: {
    managerId: number;
    emoji: string;
    awardName: string;
    nickname: string;
    narrative: string;
  }[];
  systemNotes: string[];
  signoff: string;
}

// ── Groq narrative generation ─────────────────────────────────────────────────

async function generateNarrative(
  gw: number,
  managers: ManagerDigestData[],
  orgName: string,
  digestPrompt: string | null
): Promise<GroqDigest | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const groq = new Groq({ apiKey });

  const gwWinner    = managers.reduce((a, b) => (b.gwScore > a.gwScore ? b : a));
  const gwLoser     = managers.reduce((a, b) => (b.gwScore < a.gwScore ? b : a));
  const bestCaptain = managers.reduce((a, b) => (b.captainPts > a.captainPts ? b : a));
  const worstBench  = managers.reduce((a, b) => (b.benchPts > a.benchPts ? b : a));

  const defaultTone = `Write in a neutral, friendly tone — light humour, reference actual stats, engaging for a group of friends.`;

  // Full prompt (with one-off mentions/announcements) goes to the summary call only.
  // Per-manager calls get just the tone/style direction so mentions aren't repeated.
  const summaryStyleInstructions = digestPrompt?.trim()
    ? `The administrator has set the following style/context instructions — follow them closely:\n\n"${digestPrompt.trim()}"\n\nAny specific announcements, mentions, or shout-outs in those instructions should appear in the intro, systemNotes, or signoff — NOT repeated per manager.`
    : defaultTone;

  const managerStyleInstructions = digestPrompt?.trim()
    ? `Match this tone/style: "${digestPrompt.trim()}"\n\nIMPORTANT: Do NOT include any specific announcements, mentions, or shout-outs — those are handled separately in the newsletter intro. Focus only on this manager's stats and performance.`
    : defaultTone;

  const standingsTable = managers
    .map((m, i) => `${i + 1}. ${m.displayName} (${m.teamName}) — ${m.totalPoints} pts total`)
    .join("\n");

  // One summary call for intro / subject / notes / signoff
  const summaryPrompt = `You write the GW${gw} digest newsletter for ${orgName}'s Fantasy Premier League league.

${summaryStyleInstructions}

GW${gw} headline stats:
- Top scorer: ${gwWinner.displayName} (${gwWinner.teamName}) — ${gwWinner.gwScore} pts
- Bottom scorer: ${gwLoser.displayName} (${gwLoser.teamName}) — ${gwLoser.gwScore} pts
- Best captain: ${bestCaptain.displayName} — ${bestCaptain.captainName} (${bestCaptain.captainPts} pts)
- Worst bench: ${worstBench.displayName} — ${worstBench.benchPts} pts left on bench

Current standings:
${standingsTable}

Respond with ONLY valid JSON:
{
  "subjectSubtitle": "short catchy email subject subtitle (max 70 chars)",
  "intro": "2-3 sentence intro paragraph",
  "systemNotes": ["3-4 short bullet observations about the league state"],
  "signoff": "single closing line"
}`;

  // One isolated call per manager — prevents any cross-manager name mixing
  const managerPrompt = (m: ManagerDigestData) => {
    const rankStr = m.rankChange > 0 ? `+${m.rankChange}` : `${m.rankChange}`;
    return `You write one section of the GW${gw} digest newsletter for ${orgName}'s Fantasy Premier League league.

${managerStyleInstructions}

Write ONLY about this one manager. Do NOT mention any other manager by name.

Manager: ${m.displayName}
Team: ${m.teamName}
GW score: ${m.gwScore} pts
Season total: ${m.totalPoints} pts
Rank change this GW: ${rankStr}
Captain: ${m.captainName} (${m.captainPts} pts)
Bench pts left on bench: ${m.benchPts}${m.chipUsed ? `\nChip used: ${m.chipUsed}` : ""}

Respond with ONLY valid JSON:
{
  "emoji": "<single emoji>",
  "awardName": "<creative award title for their week>",
  "nickname": "<nickname fitting the style above>",
  "narrative": "<2-3 sentences about ${m.displayName} only, referencing only the stats above>"
}`;
  };

  try {
    const GROQ_MODEL = "llama-3.3-70b-versatile";
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Run calls sequentially with a small gap to avoid blowing the free-tier
    // 6,000 TPM limit that occurs when all N+1 calls fire simultaneously.
    const summaryResult = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 1.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: summaryPrompt }],
    });

    const managerResults = [];
    for (const m of managers) {
      await delay(1000); // 1 s gap keeps cumulative TPM well under the limit
      const result = await groq.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 1.1,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: managerPrompt(m) }],
      });
      managerResults.push(result);
    }

    const summary = JSON.parse(summaryResult.choices[0]?.message?.content ?? "{}") as Omit<GroqDigest, "managers">;

    const managerSections = managerResults.map((result, i) => {
      const m = managers[i];
      const parsed = JSON.parse(result.choices[0]?.message?.content ?? "{}") as {
        emoji?: string;
        awardName?: string;
        nickname?: string;
        narrative?: string;
      };
      return {
        managerId: m.managerId,
        emoji: parsed.emoji ?? "📊",
        awardName: parsed.awardName ?? "Performance Report",
        nickname: parsed.nickname ?? m.displayName,
        narrative: parsed.narrative ?? `${m.displayName} scored ${m.gwScore} pts this week.`,
      };
    });

    return {
      subjectSubtitle: summary.subjectSubtitle ?? `GW${gw} Results`,
      intro: summary.intro ?? `GW${gw} has concluded.`,
      managers: managerSections,
      systemNotes: Array.isArray(summary.systemNotes) ? summary.systemNotes : [],
      signoff: summary.signoff ?? "Until next gameweek.",
    };
  } catch (err) {
    console.error("[email-digest] Groq error:", err);
    throw err; // re-throw so caller can surface the real message
  }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildEmailHtml(
  gw: number,
  orgName: string,
  managers: ManagerDigestData[],
  digest: GroqDigest | null,
  appUrl: string
): string {
  const subject = digest?.subjectSubtitle ?? `GW${gw} Results`;

  const managerMap = new Map(managers.map((m) => [m.managerId, m]));

  // Build per-manager sections
  const managerSections = (digest?.managers ?? managers.map((m) => ({
    managerId: m.managerId,
    emoji: "📊",
    awardName: "Performance Report",
    nickname: "Manager",
    narrative: `${m.displayName} scored ${m.gwScore} pts this week, bringing their total to ${m.totalPoints} pts.`,
  }))).map((section) => {
    const m = managerMap.get(section.managerId);
    if (!m) return "";
    const rankSymbol = m.rankChange > 0 ? `↑${m.rankChange}` : m.rankChange < 0 ? `↓${Math.abs(m.rankChange)}` : "—";
    return `
    <tr>
      <td style="padding: 20px 0; border-bottom: 1px solid #e2e8f0;">
        <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700; color: #1e293b;">
          ${section.emoji} ${section.awardName}
        </p>
        <p style="margin: 0 0 10px 0; font-size: 13px; color: #64748b;">
          ${m.displayName} &ldquo;${section.nickname}&rdquo; (${m.teamName}) &mdash; ${m.gwScore} pts &nbsp;|&nbsp; ${m.totalPoints} total &nbsp;|&nbsp; ${rankSymbol}${m.chipUsed ? ` &nbsp;|&nbsp; <strong>${m.chipUsed.toUpperCase()}</strong>` : ""}
        </p>
        <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.6;">
          ${section.narrative}
        </p>
      </td>
    </tr>`;
  }).join("");

  // Build league table rows
  const tableRows = managers.map((m, i) => {
    const rankChange = m.rankChange > 0 ? `<span style="color: #16a34a;">▲${m.rankChange}</span>` : m.rankChange < 0 ? `<span style="color: #dc2626;">▼${Math.abs(m.rankChange)}</span>` : `<span style="color: #94a3b8;">—</span>`;
    const rowBg = i % 2 === 0 ? "#f8fafc" : "#ffffff";
    return `
      <tr style="background: ${rowBg};">
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #64748b; width: 32px; text-align: center;">${i + 1}</td>
        <td style="padding: 8px 12px; font-size: 13px;">
          <span style="font-weight: 600; color: #1e293b;">${m.teamName || m.displayName}</span><br>
          <span style="color: #64748b; font-size: 12px;">${m.displayName}</span>
        </td>
        <td style="padding: 8px 12px; font-size: 13px; text-align: center; font-weight: 700; color: #1e293b;">${m.gwScore}</td>
        <td style="padding: 8px 12px; font-size: 13px; text-align: center; font-weight: 700; color: #37003c;">${m.totalPoints}</td>
        <td style="padding: 8px 12px; font-size: 13px; text-align: center;">${rankChange}</td>
      </tr>`;
  }).join("");

  const systemNotes = (digest?.systemNotes ?? []).map((note) => `
    <li style="padding: 4px 0; font-size: 14px; color: #334155;">${note}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GW${gw} Digest — ${orgName}</title>
</head>
<body style="margin: 0; padding: 0; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: #37003c; border-radius: 12px 12px 0 0; padding: 28px 32px;">
              <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #00ff87;">
                ${orgName} Fantasy Grid
              </p>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; line-height: 1.3;">
                ⚽ GW${gw} Roundup &mdash; ${subject}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background: #ffffff; padding: 32px;">

              <!-- Intro -->
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.7;">Dear Managers,</p>
              <p style="margin: 0 0 32px 0; font-size: 14px; color: #334155; line-height: 1.7;">
                ${digest?.intro ?? `GW${gw} has concluded. Here is the official settlement report.`}
              </p>

              <!-- Manager sections -->
              <table width="100%" cellpadding="0" cellspacing="0">
                ${managerSections}
              </table>

              <!-- League table -->
              <p style="margin: 32px 0 12px 0; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8;">
                ${orgName} League Table
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; border-collapse: collapse;">
                <tr style="background: #1e293b;">
                  <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-align: center; width: 32px;">#</th>
                  <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-align: left;">Team / Manager</th>
                  <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-align: center;">GW</th>
                  <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-align: center;">Total</th>
                  <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-align: center;">Change</th>
                </tr>
                ${tableRows}
              </table>

              ${systemNotes ? `
              <!-- System Notes -->
              <p style="margin: 32px 0 8px 0; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8;">
                System Stress Notes
              </p>
              <ul style="margin: 0 0 24px 0; padding: 0 0 0 20px;">
                ${systemNotes}
              </ul>` : ""}

              <!-- Sign-off -->
              <p style="margin: 32px 0 0 0; font-size: 14px; color: #334155; line-height: 1.7; border-top: 1px solid #e2e8f0; padding-top: 24px;">
                ${digest?.signoff ?? "Until next gameweek — may your captains start and your bench collect dust."}
              </p>
              <p style="margin: 16px 0 0 0; font-size: 13px; color: #94a3b8;">
                &mdash; Your Fantasy Grid Operator
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; border-radius: 0 0 12px 12px; padding: 16px 32px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; text-align: center;">
                <a href="${appUrl}" style="color: #94a3b8; text-decoration: underline;">${orgName} FPL Tracker</a> &nbsp;&middot;&nbsp; GW${gw} &nbsp;&middot;&nbsp; Auto-generated report
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    configured: isSmtpConfigured(),
    groqConfigured: !!process.env.GROQ_API_KEY,
  });
}

export async function POST(request: Request) {
  // Admin auth
  if (!isAdminRequest(request as Parameters<typeof isAdminRequest>[0])) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (!isSmtpConfigured()) {
    return NextResponse.json(
      { error: "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in your environment.", code: "EMAIL_NOT_CONFIGURED" },
      { status: 400 }
    );
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured. The digest requires AI generation — add your Groq API key to the environment.", code: "GROQ_NOT_CONFIGURED" },
      { status: 400 }
    );
  }

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

    // Use the last fully completed GW for the digest
    const finishedGws = bootstrap.events
      .filter((e) => e.finished)
      .map((e) => e.id);
    const digestGw = finishedGws.length > 0 ? Math.max(...finishedGws) : currentGw;

    const playerName = new Map(bootstrap.elements.map((e) => [e.id, e.web_name]));

    // Fetch all member histories + captain picks for the digest GW
    const memberData = await Promise.all(
      org.members.map(async (m) => {
        const history = await fetchEntryHistory(m.managerId);
        let captainId: number | null = null;
        try {
          const picks = await fetchEntryPicks(m.managerId, digestGw);
          captainId = picks.picks.find((p) => p.is_captain)?.element ?? null;
        } catch {
          // Private team or GW not played
        }
        return { member: m, history, captainId };
      })
    );

    // Live pts for digest GW
    const liveGw = await fetchLiveGw(digestGw);
    const liveMap = new Map(liveGw.elements.map((el) => [el.id, el.stats.total_points]));

    // Build per-manager digest data
    const digestData: ManagerDigestData[] = (memberData
      .map(({ member, history, captainId }) => {
        const gwEntry = history.current.find((e) => e.event === digestGw);
        if (!gwEntry) return null;

        const prevEntry = history.current.find((e) => e.event === digestGw - 1);
        const totalPoints = gwEntry.total_points - (member.pointsDeductionPerGw ?? 0) * history.current.filter((e) => e.event <= digestGw).length;
        const chip = history.chips.find((c) => c.event === digestGw);

        return {
          managerId: member.managerId,
          displayName: member.displayName ?? `Manager ${member.managerId}`,
          teamName: member.teamName ?? "",
          gwScore: gwEntry.points,
          totalPoints,
          rank: gwEntry.overall_rank ?? 0,
          prevRank: prevEntry?.overall_rank ?? gwEntry.overall_rank ?? 0,
          rankChange: (prevEntry?.overall_rank ?? gwEntry.overall_rank ?? 0) - (gwEntry.overall_rank ?? 0),
          captainName: captainId ? (playerName.get(captainId) ?? `#${captainId}`) : "Unknown",
          captainPts: captainId ? (liveMap.get(captainId) ?? 0) : 0,
          benchPts: gwEntry.points_on_bench,
          chipUsed: chip?.name ?? null,
        };
      })
      .filter((d) => d !== null) as ManagerDigestData[])
      .sort((a, b) => b.totalPoints - a.totalPoints);

    if (digestData.length === 0) {
      return NextResponse.json(
        { error: "No GW data available yet", code: "NO_DATA" },
        { status: 404 }
      );
    }

    // Generate AI narrative — use cached version if available for this GW
    // to avoid burning Groq tokens on every send.
    let groqDigest: GroqDigest | null = null;

    if (org.digestCacheGw === digestGw && org.digestCacheJson) {
      try {
        groqDigest = JSON.parse(org.digestCacheJson) as GroqDigest;
        console.log(`[email-digest] Using cached digest for GW${digestGw}`);
      } catch {
        groqDigest = null; // corrupted cache — fall through to regenerate
      }
    }

    if (!groqDigest) {
      try {
        groqDigest = await generateNarrative(digestGw, digestData, org.name, org.digestPrompt ?? null);
      } catch (groqErr) {
        const msg = groqErr instanceof Error ? groqErr.message : String(groqErr);
        console.error("[POST /api/email-digest] Groq failure:", msg);
        return NextResponse.json(
          { error: `AI generation failed: ${msg}`, code: "GROQ_ERROR" },
          { status: 502 }
        );
      }
      if (!groqDigest) {
        return NextResponse.json(
          { error: "AI generation failed. The digest was not sent. Check your GROQ_API_KEY and try again.", code: "GROQ_ERROR" },
          { status: 502 }
        );
      }
      // Persist cache so subsequent sends for this GW skip Groq entirely
      await db.organisation.update({
        where: { id: org.id },
        data: { digestCacheGw: digestGw, digestCacheJson: JSON.stringify(groqDigest) },
      });
    }

    // Build email — prefer explicit APP_URL env var over the request origin,
    // which resolves to http://0.0.0.0:3000 when running behind a reverse proxy.
    const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
    const html = buildEmailHtml(digestGw, org.name, digestData, groqDigest, appUrl);
    const subject = `⚽ GW${digestGw} Roundup – ${groqDigest?.subjectSubtitle ?? `${org.name} Results`}`;

    // Collect recipient emails from member records
    const recipients = org.members
      .map((m) => m.email?.trim())
      .filter((e): e is string => !!e);

    // Send
    await sendDigestEmail(subject, html, recipients);

    return NextResponse.json({
      success: true,
      gw: digestGw,
      recipients: recipients.length,
    });
  } catch (err) {
    console.error("[POST /api/email-digest]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send digest", code: "SEND_ERROR" },
      { status: 500 }
    );
  }
}
