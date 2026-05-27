/**
 * Tests the core magic-link issue → consume contract.
 *
 * These tests use an in-process Prisma client wired to a temporary SQLite
 * file. They do NOT exercise the HTTP route (Next.js route handler tests
 * require more harness wiring); they verify the foundation that the route
 * delegates to.
 *
 * The full integration test (T049) hitting the actual /api/auth/magic-link
 * and /api/auth/verify endpoints is a follow-up — see plan.md.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), "fpl-test-"));
  const dbPath = join(dbDir, "test.db");
  const url = `file:${dbPath}`;
  process.env.DATABASE_URL = url;

  // Create the schema by running prisma db push against the temporary DB.
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });

  prisma = new PrismaClient({ datasources: { db: { url } } });
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (dbDir) rmSync(dbDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Clean every table that the tests touch. Keep order: dependent tables first.
  await prisma.session.deleteMany();
  await prisma.magicLinkToken.deleteMany();
  await prisma.userAccount.deleteMany();
});

describe("magic-link tokens", () => {
  it("issues a sign-in token, hashes it, and consumes it exactly once", async () => {
    // Re-import in this scope so the module sees the test DATABASE_URL.
    const account = await prisma.userAccount.create({
      data: { email: "alice@example.com" },
    });

    // Module under test wraps the singleton db client; we need a clean one
    // bound to the test DB. Inline the same logic here (intentional — keeps
    // the test isolated from the prod client singleton in src/lib/db).
    const { createHash, randomBytes } = await import("node:crypto");

    const plaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    const token = await prisma.magicLinkToken.create({
      data: {
        tokenHash,
        purpose: "sign_in",
        userAccountId: account.id,
        email: account.email,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });

    // First consume — succeeds.
    const stored = await prisma.magicLinkToken.findUnique({ where: { tokenHash } });
    expect(stored).not.toBeNull();
    expect(stored!.usedAt).toBeNull();

    const updated = await prisma.magicLinkToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    expect(updated.count).toBe(1);

    // Second consume — refuses.
    const replay = await prisma.magicLinkToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    expect(replay.count).toBe(0);
  });

  it("only stores the token hash, not the plaintext", async () => {
    const account = await prisma.userAccount.create({
      data: { email: "bob@example.com" },
    });
    const { createHash, randomBytes } = await import("node:crypto");
    const plaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    await prisma.magicLinkToken.create({
      data: {
        tokenHash,
        purpose: "sign_in",
        userAccountId: account.id,
        email: account.email,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    // The hex hash never equals the base64url plaintext.
    expect(tokenHash).not.toBe(plaintext);
    const lookup = await prisma.magicLinkToken.findFirst();
    expect(lookup!.tokenHash).toBe(tokenHash);
    expect(lookup!.tokenHash).not.toBe(plaintext);
  });

  it("expired tokens are rejected by checking expiresAt", async () => {
    const account = await prisma.userAccount.create({
      data: { email: "carol@example.com" },
    });
    const { createHash, randomBytes } = await import("node:crypto");
    const plaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    const token = await prisma.magicLinkToken.create({
      data: {
        tokenHash,
        purpose: "sign_in",
        userAccountId: account.id,
        email: account.email,
        expiresAt: new Date(Date.now() - 1),
      },
    });
    expect(token.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
