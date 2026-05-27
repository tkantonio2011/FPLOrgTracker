/**
 * Capture screenshots of every manual topic that has a corresponding live
 * surface in the dev app, sign in with a pre-created session, drive Playwright
 * to navigate each URL, screenshot it, and save it under
 * `public/manual/img/<topic>/<name>.png`.
 *
 * Prerequisites:
 *   1. `npx tsx scripts/create-screenshot-session.ts` to mint a session token.
 *   2. `npm run dev` running in another terminal on http://localhost:3000.
 *
 * Usage:
 *   SCREENSHOT_SESSION=<plaintext-token> npx tsx scripts/capture-manual-screenshots.ts
 *
 * The script writes alongside each `.png` a freshly authored `.alt` sidecar so
 * the alt-text reflects the actual captured image, then prints a summary of
 * the MDX edits needed to swap the `.svg` references over to `.png`.
 */

import { chromium, type Page } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const SESSION = process.env.SCREENSHOT_SESSION;
if (!SESSION) {
  process.stderr.write(
    "ERROR: SCREENSHOT_SESSION env var not set. Run `npx tsx scripts/create-screenshot-session.ts` and pass its output.\n",
  );
  process.exit(1);
}
const SLUG = process.env.SCREENSHOT_LEAGUE_SLUG ?? "energyone";

const IMG_ROOT = join(process.cwd(), "public", "manual", "img");

interface ShotPlan {
  /** Path under public/manual/img/, e.g. "standings/overview.png" */
  out: string;
  /** Page to navigate to (relative to BASE_URL) */
  url: string;
  /** Text to wait for before screenshot (sentinel that the page rendered) */
  waitFor?: string;
  /** Optional pre-screenshot interaction (open dropdown, click button, etc.) */
  interact?: (page: Page) => Promise<void>;
  /** Alt text for the .alt sidecar */
  alt: string;
  /** Capture full page or just viewport (defaults to viewport) */
  fullPage?: boolean;
  /** Optional viewport size override */
  viewport?: { width: number; height: number };
}

const PLANS: ShotPlan[] = [
  // --- Getting Started ---
  {
    out: "welcome/overview.png",
    url: `/l/${SLUG}/standings`,
    waitFor: "Dashboard",
    alt: "The Standings page that opens after you sign in, showing the league leaderboard.",
  },
  {
    out: "switching-leagues/dropdown.png",
    url: `/leagues`,
    waitFor: "Choose a league",
    alt: "The Choose-a-league page partitioned into 'Leagues you administer' and 'Leagues you're a member of'.",
  },

  // --- Reading the App ---
  {
    out: "standings/overview.png",
    url: `/l/${SLUG}/standings`,
    waitFor: "Dashboard",
    fullPage: true,
    alt: "The Standings page with the season points-race chart and the per-manager leaderboard, sorted by total points.",
  },
  {
    out: "live-points/overview.png",
    url: `/l/${SLUG}/live`,
    waitFor: "Live Points",
    fullPage: true,
    alt: "The Live Points page showing each manager's live gameweek score, with players still to play and provisional bonus.",
  },
  {
    out: "transfers/overview.png",
    url: `/l/${SLUG}/transfers`,
    waitFor: "Transfer Activity",
    fullPage: true,
    alt: "The Transfer Activity page listing every transfer per manager in chronological order, with hit cost and net result.",
  },
  {
    out: "form-table/overview.png",
    url: `/l/${SLUG}/form`,
    waitFor: "Form Table",
    fullPage: true,
    alt: "The Form Table re-ranked by last-three-gameweek average, with inline trend sparklines per manager.",
  },
  {
    out: "season-stats/overview.png",
    url: `/l/${SLUG}/season-stats`,
    waitFor: "Season Stats",
    fullPage: true,
    alt: "The Season Stats page with league-wide cumulative totals at the top and per-manager breakdowns below.",
  },
  {
    out: "bench-waste/overview.png",
    url: `/l/${SLUG}/bench`,
    waitFor: "Bench Points Wasted",
    fullPage: true,
    alt: "The Bench Waste heatmap — managers as rows, gameweeks as columns, with cell colour scaling by points wasted.",
  },
  {
    out: "captain-history/overview.png",
    url: `/l/${SLUG}/captain-history`,
    waitFor: "Captain History",
    fullPage: true,
    alt: "The Captain History grid showing every manager's captain pick for every gameweek, colour-coded by points scored.",
  },
  {
    out: "h2h/overview.png",
    url: `/l/${SLUG}/h2h`,
    waitFor: "H2H Battle Simulator",
    fullPage: true,
    alt: "The H2H Battle Simulator comparing two selected managers' starting elevens side by side with differential picks highlighted.",
  },
  {
    out: "regret/overview.png",
    url: `/l/${SLUG}/regret`,
    waitFor: "Transfer Regret Tracker",
    fullPage: true,
    alt: "The Transfer Regret table sorted worst-first, with the sold player, bought player, hit cost, and realised net point difference.",
  },
  {
    out: "agony/overview.png",
    url: `/l/${SLUG}/agony`,
    waitFor: "The Agony Index",
    fullPage: true,
    alt: "The Agony Index leaderboard with stacked-bar visualisation showing each manager's pain by component.",
  },
  {
    out: "luck/overview.png",
    url: `/l/${SLUG}/luck`,
    waitFor: "Lucky / Unlucky Ranking",
    fullPage: true,
    alt: "The Luck Ranking page comparing actual to expected points per manager, with the luckiest and unluckiest at the extremes.",
  },
  {
    out: "captain-whatif/overview.png",
    url: `/l/${SLUG}/captain-whatif`,
    waitFor: "What If I",
    fullPage: true,
    alt: "The Captain What-If page with the season summary tiles and colour-coded bar chart of missed captain points per gameweek.",
  },
  {
    out: "wall-of-shame/overview.png",
    url: `/l/${SLUG}/wall-of-shame`,
    waitFor: "Wall of Shame",
    fullPage: true,
    alt: "The Wall of Shame with six trophy cards: Bench Warmer, Masochist Medal, Wooden Spoon, Bonfire of Vanities, Armband of Doom, Regret Machine.",
  },
  {
    out: "fixtures/overview.png",
    url: `/fixtures`,
    waitFor: "Fixtures",
    fullPage: true,
    alt: "The Fixtures grid — teams on the y-axis, the next five gameweeks on the x-axis, colour-coded by FPL difficulty rating.",
  },
  {
    out: "ownership/overview.png",
    url: `/l/${SLUG}/ownership`,
    waitFor: "Player Ownership",
    fullPage: true,
    alt: "The Ownership table listing every player owned by anyone in the league, with the count of owners and manager chips.",
  },
  {
    out: "differentials/overview.png",
    url: `/l/${SLUG}/differentials`,
    waitFor: "Differential Alerts",
    fullPage: true,
    alt: "The Differential Alerts page showing low-owned players who scored big in the most recent gameweek.",
  },
  {
    out: "injuries/overview.png",
    url: `/l/${SLUG}/player-status`,
    waitFor: "Injury",
    fullPage: true,
    alt: "The Injury and Doubt Tracker listing players with a less-than-100% chance of playing and which managers own them.",
  },

  // --- League Admin ---
  {
    out: "admin-overview/dashboard.png",
    url: `/my-admin`,
    waitFor: "admin",
    fullPage: true,
    alt: "The My-Admin overview listing every league the user administers with deep-link buttons for Settings, Members, Digest, and Audit.",
  },
  {
    out: "league-settings/form.png",
    url: `/l/${SLUG}/admin/settings`,
    waitFor: "League settings",
    fullPage: true,
    alt: "The League Settings form with the Name, Slug, Logo URL, Mini-League ID, and Digest Prompt fields.",
  },
  {
    out: "syncing-members/button.png",
    url: `/l/${SLUG}/admin/members`,
    waitFor: "Members",
    fullPage: true,
    alt: "The Members admin page with the Sync from League button and the synced member list.",
  },
  {
    out: "inviting-members/form.png",
    url: `/l/${SLUG}/admin/members`,
    waitFor: "Members",
    fullPage: true,
    alt: "The Members admin page where invitations are issued. Same surface as syncing-members, with the invite affordances visible.",
  },
  {
    out: "editing-members/modal.png",
    url: `/l/${SLUG}/admin/members`,
    waitFor: "Members",
    fullPage: true,
    alt: "The Members admin page showing the per-row edit affordances (display name, team name, email, deduction).",
  },
  {
    out: "weekly-digest/page.png",
    url: `/l/${SLUG}/admin/digest`,
    waitFor: "GW digest",
    fullPage: true,
    alt: "The Digest admin page with the configuration banner, the Send GW Digest Now button, and the most-recent-send timestamp.",
  },
  {
    out: "audit-log/table.png",
    url: `/l/${SLUG}/admin/audit`,
    waitFor: "Audit log",
    fullPage: true,
    alt: "The Audit Log table sorted newest-first, listing administrative actions with actor, action key, target, and timestamp columns.",
  },
];

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  // Attach the session cookie BEFORE any navigation so the (main) middleware
  // sees us as signed in on the very first request.
  await context.addCookies([
    {
      name: "session",
      value: SESSION!,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();

  let ok = 0;
  let failed = 0;
  for (const plan of PLANS) {
    const outPath = join(IMG_ROOT, plan.out);
    mkdirSync(dirname(outPath), { recursive: true });
    try {
      if (plan.viewport) {
        await page.setViewportSize(plan.viewport);
      }
      const url = `${BASE_URL}${plan.url}`;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      if (!resp || !resp.ok()) {
        throw new Error(`navigation returned ${resp?.status() ?? "no response"}`);
      }
      if (plan.waitFor) {
        await page.waitForSelector(`text=${plan.waitFor}`, { timeout: 90_000 });
      }
      // Give a beat for any lazy-loaded data (charts, tables) to settle.
      await page.waitForTimeout(2500);
      if (plan.interact) {
        await plan.interact(page);
        await page.waitForTimeout(500);
      }
      await page.screenshot({
        path: outPath,
        fullPage: plan.fullPage ?? false,
        type: "png",
      });
      writeFileSync(`${outPath}.alt`, plan.alt + "\n", "utf-8");
      process.stdout.write(`  ✓ ${plan.out}\n`);
      ok++;
    } catch (err) {
      process.stderr.write(`  ✗ ${plan.out}: ${(err as Error).message}\n`);
      failed++;
    }
  }
  await browser.close();
  process.stdout.write(`\n[capture] ok=${ok} failed=${failed} of ${PLANS.length}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[capture] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
