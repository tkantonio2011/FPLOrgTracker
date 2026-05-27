/**
 * Create a fresh session for the existing tkawka@proxicon.io account in
 * prisma/dev.db so the manual-screenshot capture can sign in without going
 * through the magic-link flow.
 *
 * Prints the plaintext session token on stdout. Pipe to a file or capture it
 * via the Playwright driver in scripts/capture-manual-screenshots.ts.
 *
 * Run via: `npx tsx scripts/create-screenshot-session.ts`
 */

import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const ADMIN_EMAIL = "tkawka@proxicon.io";

async function main(): Promise<void> {
  const db = new PrismaClient();
  try {
    const user = await db.userAccount.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!user) {
      throw new Error(`No UserAccount with email "${ADMIN_EMAIL}" found in dev.db`);
    }
    const plaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    await db.session.create({
      data: {
        tokenHash,
        userAccountId: user.id,
        // Hard-coded far-future date to defeat process-to-process clock drift
        // in this dev environment. Safe — these sessions can be deleted from
        // prisma/dev.db when capture is finished.
        expiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });
    process.stdout.write(plaintext + "\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`[create-screenshot-session] ${(err as Error).message}\n`);
  process.exit(1);
});
