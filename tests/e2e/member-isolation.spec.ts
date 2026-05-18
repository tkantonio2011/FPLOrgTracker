/**
 * SC-006 verifier (UI layer). The route-level isolation is exercised by
 * `tests/integration/league-isolation.test.ts`; this spec covers the same
 * invariant in a real Chromium browser to catch regressions in the
 * server-side layout decision (`requireLeagueMemberFromCookie` →
 * notFound/redirect) and the middleware sign-in gate.
 *
 * Seed fixture is created by `tests/e2e/setup-db.ts` before Playwright
 * launches the webServer (see `playwright.config.ts`).
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Fixture {
  leagueA: { id: string; slug: string; name: string };
  leagueB: { id: string; slug: string; name: string };
  member: { email: string; managerId: number };
  sessionPlaintext: string;
}

const fixture = JSON.parse(
  readFileSync(join(__dirname, ".fixture.json"), "utf-8"),
) as Fixture;

test.describe("SC-006: member isolation (UI)", () => {
  test("signed-in member of A reaches /l/{A}/standings", async ({ page, context, baseURL }) => {
    await context.addCookies([
      {
        name: "session",
        value: fixture.sessionPlaintext,
        url: baseURL ?? "http://localhost:3100",
        httpOnly: true,
      },
    ]);

    const response = await page.goto(`/l/${fixture.leagueA.slug}/standings`);
    // Layout granted access — page.tsx may render placeholder content while
    // its client-side TanStack Query fetches; what matters is no 404 / no
    // redirect to /sign-in.
    expect(response?.status()).toBe(200);
    expect(page.url()).toContain(`/l/${fixture.leagueA.slug}/standings`);
  });

  test("member of A visiting /l/{B}/standings receives 404", async ({ page, context, baseURL }) => {
    await context.addCookies([
      {
        name: "session",
        value: fixture.sessionPlaintext,
        url: baseURL ?? "http://localhost:3100",
        httpOnly: true,
      },
    ]);

    // The layout throws LeagueNotVisibleError → notFound(). Next.js returns
    // HTTP 404 with the not-found UI.
    const response = await page.goto(`/l/${fixture.leagueB.slug}/standings`);
    expect(response?.status()).toBe(404);
    // The negative assertion: League B's name MUST NOT appear in the rendered
    // document — non-disclosure of B's existence.
    await expect(page.getByText(fixture.leagueB.name)).toHaveCount(0);
  });

  test("unauthenticated request to /l/{A}/standings redirects to /sign-in", async ({ page }) => {
    // No cookies set — middleware should intercept before the layout runs.
    await page.goto(`/l/${fixture.leagueA.slug}/standings`);
    expect(page.url()).toContain("/sign-in");
    expect(page.url()).toContain("redirect=");
    expect(page.url()).toContain(encodeURIComponent(`/l/${fixture.leagueA.slug}/standings`));
  });
});
