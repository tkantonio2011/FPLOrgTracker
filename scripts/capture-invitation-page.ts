/**
 * One-off capture of the /invitations/<token> page. Creates an invitation row
 * in dev.db with a fresh token, navigates to it via Playwright, screenshots
 * the acceptance page, then revokes the invitation so it doesn't linger.
 *
 * Usage:
 *   SCREENSHOT_BASE_URL=http://localhost:3001 npx tsx scripts/capture-invitation-page.ts
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3001";
const SLUG = process.env.SCREENSHOT_LEAGUE_SLUG ?? "energyone";

const OUT_PATH = join(process.cwd(), "public", "manual", "img", "accepting-an-invitation", "page.png");
const ALT_PATH = `${OUT_PATH}.alt`;

async function main(): Promise<void> {
  const db = new PrismaClient();
  let invitationId: string | undefined;
  try {
    const league = await db.league.findUnique({ where: { slug: SLUG } });
    if (!league) throw new Error(`No league with slug "${SLUG}"`);
    const inviter = await db.userAccount.findUnique({ where: { email: "tkawka@proxicon.io" } });
    if (!inviter) throw new Error("Inviter UserAccount not found");

    const plaintextToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintextToken).digest("hex");
    const invitation = await db.invitation.create({
      data: {
        leagueId: league.id,
        invitedByUserAccountId: inviter.id,
        email: "screenshot-invitee@example.test",
        role: "member",
      },
    });
    invitationId = invitation.id;
    await db.magicLinkToken.create({
      data: {
        tokenHash,
        purpose: "invitation",
        email: "screenshot-invitee@example.test",
        invitationId: invitation.id,
        expiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const url = `${BASE_URL}/invitations/${plaintextToken}`;
    process.stdout.write(`navigating to ${url}\n`);
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    process.stdout.write(`status: ${resp?.status()}\n`);
    await page.waitForTimeout(2500);

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    await page.screenshot({ path: OUT_PATH, fullPage: false, type: "png" });
    writeFileSync(
      ALT_PATH,
      `The invitation acceptance page (/invitations/<token>). Shows the league logo and name, the inviting admin, the invitee's role, and the field for the FPL Manager ID before clicking Accept.\n`,
      "utf-8",
    );
    await browser.close();

    process.stdout.write(`saved ${OUT_PATH}\n`);
  } finally {
    if (invitationId) {
      // Revoke the invitation so it doesn't linger.
      await db.invitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date() },
      });
    }
    await db.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`[capture-invitation] ${(err as Error).message}\n`);
  process.exit(1);
});
