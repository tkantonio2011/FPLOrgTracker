/**
 * Optional periodic cleanup of expired and used magic-link tokens.
 *
 * Deletes `MagicLinkToken` rows where any of:
 *   - `usedAt < now - 30 days`     (consumed long ago — no purpose to retain)
 *   - `expiresAt < now - 30 days`  (expired long ago — no purpose to retain)
 *
 * Active sessions are NOT affected (different table — `Session` has its own
 * sliding-TTL invariant). Pending invitations are NOT affected even if their
 * paired token is deleted (an admin can re-issue an invitation if needed).
 *
 * Not required for v1 functionality. Documented in
 * `specs/002-multi-league-platform/quickstart.md` as an optional cron.
 *
 * Usage:
 *   npx tsx scripts/cleanup-tokens.ts
 *   npx tsx scripts/cleanup-tokens.ts --dry-run   # report counts, no deletes
 */

import { PrismaClient } from "@prisma/client";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = new PrismaClient();
  const cutoff = new Date(Date.now() - RETENTION_MS);

  const condition = {
    OR: [{ usedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
  };

  if (dryRun) {
    const count = await db.magicLinkToken.count({ where: condition });
    console.log(
      `[cleanup-tokens] dry-run: would delete ${count} MagicLinkToken row${count === 1 ? "" : "s"} ` +
        `older than ${cutoff.toISOString()}`,
    );
  } else {
    const result = await db.magicLinkToken.deleteMany({ where: condition });
    console.log(
      `[cleanup-tokens] deleted ${result.count} MagicLinkToken row${result.count === 1 ? "" : "s"} ` +
        `older than ${cutoff.toISOString()}`,
    );
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error("[cleanup-tokens] failed:", err);
  process.exit(1);
});
