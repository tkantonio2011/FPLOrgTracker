import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Playwright config for the multi-league platform's E2E suite.
 *
 * Browser binaries are not installed by `npm install`. To run these tests:
 *   npx playwright install chromium
 *
 * The dev server is launched on port 3100 against an isolated SQLite DB
 * (`prisma/e2e-test.db`) seeded by `tests/e2e/setup-db.ts`. We deliberately
 * do NOT reuse an existing dev server: a regular `npm run dev` points at
 * the developer's real DB, which would invalidate the seeded fixtures.
 *
 * Override the base URL (and skip the embedded webServer) with
 * `PLAYWRIGHT_BASE_URL=http://...`.
 */

const E2E_PORT = 3100;
const REPO_ROOT = __dirname;
const E2E_DB_PATH = path.join(REPO_ROOT, "prisma", "e2e-test.db").replace(/\\/g, "/");
const E2E_DB_URL = `file:${E2E_DB_PATH}`;

function nonUndefinedEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Force serial execution: the spec drives a single seeded session against
  // a single SQLite DB. Parallel workers would race on cookies / fixtures.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${E2E_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: `http://localhost:${E2E_PORT}`,
        timeout: 180_000,
        // The E2E DB is seeded by `setup-db.ts` and is distinct from any
        // dev DB. Reusing a running dev server would defeat that isolation.
        reuseExistingServer: false,
        env: {
          ...nonUndefinedEnv(),
          PORT: String(E2E_PORT),
          DATABASE_URL: E2E_DB_URL,
          // Bootstrap is idempotent; leave it unset so it short-circuits.
          BOOTSTRAP_SUPER_ADMIN_EMAIL: "",
        },
      },
});
