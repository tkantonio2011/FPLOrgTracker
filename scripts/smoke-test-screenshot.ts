/**
 * Single-shot smoke test for the capture pipeline. Sign in, navigate to
 * /l/<slug>/standings, screenshot, exit. Useful to verify:
 *   - The session cookie is accepted by middleware.
 *   - The FPL API is reachable so the page renders with data.
 *   - The viewport sizing produces a reasonable image.
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const SESSION = process.env.SCREENSHOT_SESSION;
const SLUG = process.env.SCREENSHOT_LEAGUE_SLUG ?? "energyone";

async function main(): Promise<void> {
  if (!SESSION) {
    process.stderr.write("SCREENSHOT_SESSION not set\n");
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addCookies([
    { name: "session", value: SESSION, url: BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") process.stderr.write(`[browser-console] ${msg.text()}\n`);
  });

  const url = `${BASE_URL}/l/${SLUG}/standings`;
  process.stdout.write(`navigating to ${url}\n`);
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  process.stdout.write(`response status: ${resp?.status()}\n`);
  process.stdout.write(`page title: ${await page.title()}\n`);
  process.stdout.write(`current url: ${page.url()}\n`);

  // Look for the Dashboard h1.
  const dashboardExists = await page.locator("text=Dashboard").count();
  process.stdout.write(`'Dashboard' occurrences on page: ${dashboardExists}\n`);

  // Look for a leaderboard row.
  const rowCount = await page.locator("tbody tr").count();
  process.stdout.write(`leaderboard rows: ${rowCount}\n`);

  const outPath = join(process.cwd(), "scratch", "smoke-test.png");
  mkdirSync(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: true });
  process.stdout.write(`screenshot saved: ${outPath}\n`);

  await browser.close();
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
