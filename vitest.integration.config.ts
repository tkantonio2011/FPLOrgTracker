import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Integration test config — runs in the Node environment, no jsdom, picks up
 * `tests/integration/**` only. Spins up a temporary SQLite DB per test file
 * via `prisma db push` (the test files set DATABASE_URL before importing
 * Prisma).
 *
 * Run with: `npm run test:integration`
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks", // separate process per file — prevents Prisma client leakage
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
