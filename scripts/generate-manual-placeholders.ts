/**
 * Generate placeholder SVGs + alt-text sidecars for every manual topic
 * that doesn't yet have real screenshots captured.
 *
 * Idempotent: skips any (svg, .alt) pair that already exists. Produces
 * a stylized FPL-themed illustration with the topic title overlaid, so
 * a reader can still see roughly what the page is about while real
 * screenshots haven't yet been captured.
 *
 * Replace by:
 *   1. Capturing the real screenshot as a 2× DPI PNG.
 *   2. Saving it at the same path with .png extension.
 *   3. Updating the matching <AnnotatedImage src> in the MDX to .png.
 *   4. Editing the .alt sidecar to reflect the captured screenshot.
 *
 * Run via: `npx tsx scripts/generate-manual-placeholders.ts`
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

interface Placeholder {
  /** Relative path under public/manual/img/, e.g. "standings/overview.svg" */
  src: string;
  /** Title text rendered on the placeholder */
  title: string;
  /** Subtitle / context — appears below the title */
  subtitle?: string;
  /** Alt-text written to the .alt sidecar */
  alt: string;
}

const PUBLIC_IMG_ROOT = join(process.cwd(), "public", "manual", "img");

// One entry per <AnnotatedImage> reference in the MDX topics.
const PLACEHOLDERS: Placeholder[] = [
  // Getting Started
  { src: "welcome/overview.svg", title: "Welcome", subtitle: "Your league's home page",
    alt: "Placeholder illustration of the Standings page that opens after you sign in." },
  { src: "magic-link/email.svg", title: "Magic-link email", subtitle: "What to look for",
    alt: "Placeholder illustration of the magic-link email — Subject line 'Sign in to FPL Tracker' with a single big 'Sign in' button." },
  { src: "switching-leagues/dropdown.svg", title: "League switcher", subtitle: "Top of the sidebar",
    alt: "Placeholder illustration of the LeagueSwitcher dropdown listing two leagues with the current one highlighted." },
  { src: "accepting-an-invitation/page.svg", title: "Invitation page", subtitle: "/invitations/<token>",
    alt: "Placeholder illustration of the invitation acceptance page showing league name, logo, and Manager-ID field." },

  // Reading the App
  { src: "standings/overview.svg", title: "Standings", subtitle: "The home leaderboard",
    alt: "Placeholder illustration of the Standings page with a leaderboard and rank-change arrows." },
  { src: "live-points/overview.svg", title: "Live Points", subtitle: "Mid-gameweek tracker",
    alt: "Placeholder illustration of the Live Points page showing per-manager live totals." },
  { src: "transfers/overview.svg", title: "Transfers", subtitle: "Recent activity",
    alt: "Placeholder illustration of the Transfers page listing recent ins and outs per manager." },
  { src: "form-table/overview.svg", title: "Form Table", subtitle: "Trend at a glance",
    alt: "Placeholder illustration of the Form Table with inline trend sparklines." },
  { src: "season-stats/overview.svg", title: "Season Stats", subtitle: "League-wide totals",
    alt: "Placeholder illustration of the Season Stats page with cumulative bench, transfer, and captain numbers." },
  { src: "bench-waste/overview.svg", title: "Bench Waste", subtitle: "Manager × Gameweek heatmap",
    alt: "Placeholder illustration of the Bench Waste heatmap showing per-manager-per-GW points left on the bench." },
  { src: "captain-history/overview.svg", title: "Captain History", subtitle: "Every captain, every week",
    alt: "Placeholder illustration of the Captain History grid by manager and gameweek." },
  { src: "h2h/overview.svg", title: "H2H Battle", subtitle: "Any two managers, any GW",
    alt: "Placeholder illustration of the head-to-head comparison between two managers showing differential picks." },
  { src: "regret/overview.svg", title: "Transfer Regret", subtitle: "What did you flush?",
    alt: "Placeholder illustration of the Transfer Regret page showing the worst single transfers per manager." },
  { src: "agony/overview.svg", title: "Agony Index", subtitle: "Composite misfortune score",
    alt: "Placeholder illustration of the Agony Index leaderboard with bench / hit / blank components stacked per manager." },
  { src: "luck/overview.svg", title: "Luck Ranking", subtitle: "Skill vs luck",
    alt: "Placeholder illustration of the Luck Ranking page comparing actual to expected points per manager." },
  { src: "captain-whatif/overview.svg", title: "Captain What-If", subtitle: "Missed points per GW",
    alt: "Placeholder illustration of the Captain What-If bar chart showing missed captain points per gameweek." },
  { src: "wall-of-shame/overview.svg", title: "Wall of Shame", subtitle: "Trophies of failure",
    alt: "Placeholder illustration of the Wall of Shame trophy cards: Bench Warmer, Masochist Medal, Wooden Spoon, etc." },
  { src: "fixtures/overview.svg", title: "Fixtures", subtitle: "Upcoming difficulty",
    alt: "Placeholder illustration of the Fixtures page with per-team upcoming fixture difficulty grids." },
  { src: "ownership/overview.svg", title: "Ownership", subtitle: "Who owns whom",
    alt: "Placeholder illustration of the Ownership page showing player ownership percentages within the league." },
  { src: "differentials/overview.svg", title: "Differentials", subtitle: "Hidden gems",
    alt: "Placeholder illustration of the Differential Alerts page listing players owned by <10% of managers." },
  { src: "injuries/overview.svg", title: "Injuries", subtitle: "Squad health watchlist",
    alt: "Placeholder illustration of the Injury and Doubt Tracker listing affected players across managers." },

  // League Admin
  { src: "admin-overview/dashboard.svg", title: "Admin Overview", subtitle: "Your league's controls",
    alt: "Placeholder illustration of the Admin dashboard showing the four admin sub-pages — Settings, Members, Digest, Audit." },
  { src: "league-settings/form.svg", title: "League Settings", subtitle: "Name, slug, logo, mini-league ID",
    alt: "Placeholder illustration of the League Settings form with the Name, Slug, Logo URL, and Mini-League ID fields." },
  { src: "syncing-members/button.svg", title: "Sync Members", subtitle: "Pull from your FPL mini-league",
    alt: "Placeholder illustration of the Sync Members button and the resulting member list with new entries highlighted." },
  { src: "inviting-members/form.svg", title: "Invite a Member", subtitle: "Send a magic-link by email",
    alt: "Placeholder illustration of the invite-by-email form with the email field, role selector, and the 'Send invitation' button." },
  { src: "editing-members/modal.svg", title: "Edit Member", subtitle: "Display name, team, deduction",
    alt: "Placeholder illustration of the edit-member modal showing display name, team name, and points-deduction fields." },
  { src: "weekly-digest/page.svg", title: "Weekly Digest", subtitle: "Send a GW summary email",
    alt: "Placeholder illustration of the Digest admin page with the 'Send GW Digest Now' button and the SMTP-configured banner." },
  { src: "audit-log/table.svg", title: "Audit Log", subtitle: "Who did what, when",
    alt: "Placeholder illustration of the Audit Log table listing administrative actions with actor, action, and timestamp columns." },
  { src: "suspended-league/banner.svg", title: "Suspended League", subtitle: "What members see",
    alt: "Placeholder illustration of the 'This league is suspended' banner that replaces every page when a Super Admin suspends a league." },
];

function svgPlaceholder(title: string, subtitle: string | undefined): string {
  // 1200×720, FPL-purple background, white card, title + subtitle.
  // Decorative <pattern> in the background gives it some visual texture.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#37003c" />
      <stop offset="100%" stop-color="#6b007f" />
    </linearGradient>
    <pattern id="grid" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="720" fill="url(#bg)"/>
  <rect width="1200" height="720" fill="url(#grid)"/>
  <rect x="120" y="200" width="960" height="320" rx="16" fill="#ffffff" opacity="0.96"/>
  <rect x="160" y="240" width="6" height="240" rx="3" fill="#00ff87"/>
  <text x="200" y="290" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="600" fill="#00ff87" letter-spacing="2">SCREENSHOT · PLACEHOLDER</text>
  <text x="200" y="370" font-family="Inter,system-ui,sans-serif" font-size="56" font-weight="800" fill="#37003c">${escapeXml(title)}</text>
  ${subtitle ? `<text x="200" y="420" font-family="Inter,system-ui,sans-serif" font-size="26" font-weight="500" fill="#4f005e">${escapeXml(subtitle)}</text>` : ""}
  <text x="200" y="478" font-family="Inter,system-ui,sans-serif" font-size="14" fill="#64748b">Replace this file with a real 2× DPI screenshot and update the .alt sidecar.</text>
</svg>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function main(): void {
  let created = 0;
  let skipped = 0;
  for (const p of PLACEHOLDERS) {
    const imgPath = join(PUBLIC_IMG_ROOT, p.src);
    const altPath = `${imgPath}.alt`;
    mkdirSync(dirname(imgPath), { recursive: true });
    if (!existsSync(imgPath)) {
      writeFileSync(imgPath, svgPlaceholder(p.title, p.subtitle), "utf-8");
      created++;
    } else {
      skipped++;
    }
    if (!existsSync(altPath)) {
      writeFileSync(altPath, p.alt, "utf-8");
    }
  }
  console.log(
    `[placeholders] created ${created} new SVG${created === 1 ? "" : "s"}, skipped ${skipped} existing.`,
  );
}

main();
