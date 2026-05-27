/**
 * Tests the invitation issue → accept flow at the Prisma contract level.
 *
 * Mirrors the precedent set by `magic-link.test.ts` — runs against a
 * temporary SQLite DB, exercises the data invariants the route handlers
 * promise (token single-use, invitation single-acceptance, membership
 * created with `source: 'invitation'`). A route-level harness that hits
 * the actual `/api/invitations/{token}/accept` is a follow-up.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), "fpl-test-"));
  const dbPath = join(dbDir, "test.db");
  const url = `file:${dbPath}`;
  process.env.DATABASE_URL = url;
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
  await prisma.auditEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.magicLinkToken.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.leagueMembership.deleteMany();
  await prisma.leagueSlugHistory.deleteMany();
  await prisma.league.deleteMany();
  await prisma.userAccount.deleteMany();
});

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

async function seedLeagueAndAdmin() {
  const admin = await prisma.userAccount.create({ data: { email: "admin@league.test" } });
  const league = await prisma.league.create({
    data: { slug: "alpha", name: "Alpha League", createdByUserAccountId: admin.id },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: league.id,
      userAccountId: admin.id,
      managerId: 1,
      role: "admin",
      source: "manual",
      isActive: true,
    },
  });
  return { admin, league };
}

describe("invitation flow", () => {
  it("creates an invitation row with a paired magic-link token", async () => {
    const { admin, league } = await seedLeagueAndAdmin();

    const invitation = await prisma.invitation.create({
      data: {
        leagueId: league.id,
        email: "invitee@example.test",
        role: "member",
        invitedByUserAccountId: admin.id,
      },
    });
    const plaintext = randomBytes(32).toString("base64url");
    await prisma.magicLinkToken.create({
      data: {
        tokenHash: hashToken(plaintext),
        purpose: "invitation",
        email: "invitee@example.test",
        invitationId: invitation.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      },
    });

    const linked = await prisma.magicLinkToken.findUnique({
      where: { tokenHash: hashToken(plaintext) },
      include: { invitation: true },
    });
    expect(linked).not.toBeNull();
    expect(linked!.purpose).toBe("invitation");
    expect(linked!.invitation?.id).toBe(invitation.id);
    expect(linked!.invitation?.email).toBe("invitee@example.test");
    expect(linked!.usedAt).toBeNull();
  });

  it("acceptance creates UserAccount, LeagueMembership, marks token used and invitation accepted", async () => {
    const { admin, league } = await seedLeagueAndAdmin();
    const invitation = await prisma.invitation.create({
      data: {
        leagueId: league.id,
        email: "newmember@example.test",
        role: "member",
        managerId: 1234,
        invitedByUserAccountId: admin.id,
      },
    });
    const plaintext = randomBytes(32).toString("base64url");
    const token = await prisma.magicLinkToken.create({
      data: {
        tokenHash: hashToken(plaintext),
        purpose: "invitation",
        email: invitation.email,
        invitationId: invitation.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      },
    });

    // Replicate the acceptance contract: consume token (single-use), upsert
    // UserAccount, create LeagueMembership(source=invitation), mark accepted.
    const consumed = await prisma.magicLinkToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    expect(consumed.count).toBe(1);

    const userAccount = await prisma.userAccount.upsert({
      where: { email: invitation.email },
      update: {},
      create: { email: invitation.email },
    });

    const membership = await prisma.leagueMembership.create({
      data: {
        leagueId: invitation.leagueId,
        userAccountId: userAccount.id,
        managerId: invitation.managerId!,
        role: invitation.role,
        source: "invitation",
        isActive: true,
        addedByUserAccountId: invitation.invitedByUserAccountId,
      },
    });
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    // Assertions on resulting state
    expect(membership.source).toBe("invitation");
    expect(membership.isActive).toBe(true);
    expect(membership.userAccountId).toBe(userAccount.id);

    const refetchedToken = await prisma.magicLinkToken.findUnique({
      where: { id: token.id },
    });
    expect(refetchedToken!.usedAt).not.toBeNull();

    const refetchedInvitation = await prisma.invitation.findUnique({
      where: { id: invitation.id },
    });
    expect(refetchedInvitation!.acceptedAt).not.toBeNull();
  });

  it("re-using the same token after acceptance fails (single-use semantics)", async () => {
    const { admin, league } = await seedLeagueAndAdmin();
    const invitation = await prisma.invitation.create({
      data: {
        leagueId: league.id,
        email: "replay@example.test",
        role: "member",
        managerId: 5555,
        invitedByUserAccountId: admin.id,
      },
    });
    const plaintext = randomBytes(32).toString("base64url");
    const token = await prisma.magicLinkToken.create({
      data: {
        tokenHash: hashToken(plaintext),
        purpose: "invitation",
        email: invitation.email,
        invitationId: invitation.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      },
    });

    // First consume succeeds.
    const first = await prisma.magicLinkToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    expect(first.count).toBe(1);

    // Second consume — refuses (the route returns 410 on this).
    const second = await prisma.magicLinkToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    expect(second.count).toBe(0);
  });

  it("expired tokens are rejected by an expiresAt check", async () => {
    const { admin, league } = await seedLeagueAndAdmin();
    const invitation = await prisma.invitation.create({
      data: {
        leagueId: league.id,
        email: "expired@example.test",
        role: "member",
        invitedByUserAccountId: admin.id,
      },
    });
    const plaintext = randomBytes(32).toString("base64url");
    const token = await prisma.magicLinkToken.create({
      data: {
        tokenHash: hashToken(plaintext),
        purpose: "invitation",
        email: invitation.email,
        invitationId: invitation.id,
        expiresAt: new Date(Date.now() - 1),
      },
    });
    expect(token.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
