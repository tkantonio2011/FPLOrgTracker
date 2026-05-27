/**
 * Phase 8 (Multi-League Admin UX) — automated equivalent of the 6 manual
 * checks in `specs/002-multi-league-platform/checklists/requirements.md`
 * lines 90-95. Run as part of `npm run test:e2e` against the same seeded
 * fixture used by `member-isolation.spec.ts`.
 *
 * The seeded multi-admin user (`multi-admin@e2e.test`) administers Leagues
 * C (Charlie) and D (Delta) and is a plain member of League E (Echo).
 *
 * Test 6 (suspended-league disabling) flips Delta's status to 'suspended'
 * via a direct Prisma write, so it MUST be the last test in the file —
 * subsequent tests would see Delta as suspended and the assertions about
 * League D's deep-links being active would fail.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

interface LeagueRef {
  id: string;
  slug: string;
  name: string;
}

interface Fixture {
  multiAdmin: {
    email: string;
    sessionPlaintext: string;
    leagueC: LeagueRef;
    leagueD: LeagueRef;
    leagueE: LeagueRef;
  };
}

const fixture = JSON.parse(
  readFileSync(join(__dirname, ".fixture.json"), "utf-8"),
) as Fixture;

const { leagueC, leagueD, leagueE, sessionPlaintext } = fixture.multiAdmin;

const REPO_ROOT = join(__dirname, "..", "..");
const DB_PATH = join(REPO_ROOT, "prisma", "e2e-test.db").replace(/\\/g, "/");
const DB_URL = `file:${DB_PATH}`;

test.use({
  storageState: {
    cookies: [
      {
        name: "session",
        value: sessionPlaintext,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  },
});

test.describe("Phase 8 — multi-league admin UX", () => {
  test("(1) /my-admin lists admin leagues only — member-only league hidden", async ({ page }) => {
    const response = await page.goto("/my-admin");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "My admin leagues" })).toBeVisible();
    await expect(page.getByRole("link", { name: leagueC.name })).toBeVisible();
    await expect(page.getByRole("link", { name: leagueD.name })).toBeVisible();
    // Negative assertion: the member-only league must NOT appear.
    await expect(page.getByRole("link", { name: leagueE.name })).toHaveCount(0);

    // Each admin league shows all four deep-links.
    const leagueCard = page.locator("li").filter({ hasText: leagueC.name });
    for (const label of ["Settings", "Members", "Digest", "Audit"]) {
      await expect(leagueCard.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("(2) LeagueSwitcher from /l/<C>/admin/members → Delta → /l/<D>/admin/members", async ({ page }) => {
    await page.goto(`/l/${leagueC.slug}/admin/members`);
    // Layout fetch can be slow on first compile; wait for the LeagueSwitcher button.
    const switcher = page.getByRole("button", { name: new RegExp(leagueC.name) });
    await switcher.click();

    // The dropdown shows the OTHER admin league (Delta) and the member league
    // (Echo). Picking Delta preserves the admin sub-path.
    await page.getByRole("link", { name: new RegExp(leagueD.name) }).click();
    await page.waitForURL(`**/l/${leagueD.slug}/admin/members`);
    expect(page.url()).toContain(`/l/${leagueD.slug}/admin/members`);
  });

  test("(3) LeagueSwitcher from /l/<C>/standings → Echo (member) → /l/<E>/standings", async ({ page }) => {
    await page.goto(`/l/${leagueC.slug}/standings`);
    const switcher = page.getByRole("button", { name: new RegExp(leagueC.name) });
    await switcher.click();

    await page.getByRole("link", { name: new RegExp(leagueE.name) }).click();
    await page.waitForURL(`**/l/${leagueE.slug}/standings`);
    expect(page.url()).toContain(`/l/${leagueE.slug}/standings`);
  });

  test("(4) /leagues shows two grouped sections (admin / member)", async ({ page }) => {
    const response = await page.goto("/leagues");
    expect(response?.status()).toBe(200);

    await expect(page.getByText("Leagues you administer")).toBeVisible();
    await expect(page.getByText(/Leagues you('re| are) a member of/)).toBeVisible();

    // Admin section: both admin leagues present with deep-links underneath.
    const adminSection = page.locator("section").filter({ hasText: "Leagues you administer" });
    await expect(adminSection.getByRole("link", { name: leagueC.name })).toBeVisible();
    await expect(adminSection.getByRole("link", { name: leagueD.name })).toBeVisible();
    // Settings deep-link appears (inline per row).
    await expect(adminSection.getByRole("link", { name: "Settings" }).first()).toBeVisible();

    // Member section: only Echo.
    const memberSection = page.locator("section").filter({ hasText: /member of/ });
    await expect(memberSection.getByRole("link", { name: leagueE.name })).toBeVisible();
    await expect(memberSection.getByRole("link", { name: leagueC.name })).toHaveCount(0);
  });

  test("(5) Sidebar inside league shell shows 'My admin leagues' link (≥2 admin roles)", async ({ page }) => {
    await page.goto(`/l/${leagueC.slug}/standings`);
    // The link is rendered by the client-side Sidebar after `useQuery(['me-leagues'])`
    // resolves — small wait for hydration is implicit in toBeVisible.
    const myAdminLink = page.getByRole("link", { name: "My admin leagues" });
    await expect(myAdminLink).toBeVisible();
    await expect(myAdminLink).toHaveAttribute("href", "/my-admin");
  });

  test("(6) Suspending Delta — /my-admin renders 'Suspended' chip + disabled deep-links", async ({ page }) => {
    // Mutate the DB out-of-band: Super Admin would normally do this via
    // POST /api/platform/leagues/{id}/suspend, but for the UX check we only
    // need the side-effect on `League.status`. Avoids seeding a Super Admin.
    const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    try {
      await prisma.league.update({
        where: { id: leagueD.id },
        data: {
          status: "suspended",
          suspendedAt: new Date(),
          suspensionReason: "E2E suspension test",
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    await page.goto("/my-admin");
    // Delta is still listed (admins retain visibility per FR-022).
    const deltaCard = page.locator("li").filter({ hasText: leagueD.name });
    await expect(deltaCard).toBeVisible();
    await expect(deltaCard.getByText("Suspended")).toBeVisible();

    // The four deep-link buttons are rendered as disabled <span>s, not <Link>s.
    for (const label of ["Settings", "Members", "Digest", "Audit"]) {
      const disabled = deltaCard.locator(`span[aria-disabled="true"]`).getByText(label, { exact: true });
      await expect(disabled).toBeVisible();
    }
    // And NO <Link> with those labels in the Delta card.
    await expect(deltaCard.getByRole("link", { name: "Settings" })).toHaveCount(0);

    // Charlie still has working deep-links (the disabling is per-row, not global).
    const charlieCard = page.locator("li").filter({ hasText: leagueC.name });
    await expect(charlieCard.getByRole("link", { name: "Settings" })).toBeVisible();
  });
});
