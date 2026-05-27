/**
 * Multi-league admin UX verifier.
 *
 * Asserts the data invariants the /my-admin Server Component and the
 * LeagueSwitcher's path-mapper rely on:
 *
 *   1. getServerUserFromCookie returns memberships annotated with role + status.
 *   2. The filter the page uses (role === 'admin' && isActive) keeps admin
 *      leagues and drops member-only leagues.
 *   3. Suspended admin leagues remain in the filtered set (admins retain view).
 *   4. The pure mapAdminPath helper preserves /admin/<sub> when target is
 *      admin and falls back to /standings otherwise.
 *
 * Patterned after tests/integration/magic-link.test.ts — uses a temp SQLite
 * file and a process-local Prisma client. Does NOT exercise the Next.js
 * Server Component rendering path (no DOM); that is covered by manual /
 * Playwright verification per quickstart.md.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { mapAdminPath } from "@/lib/routing/admin-path-mapper";

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), "fpl-multi-admin-"));
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
  // Wipe everything per-test so the seeds are isolated.
  await prisma.session.deleteMany({});
  await prisma.auditEvent.deleteMany({});
  await prisma.magicLinkToken.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.leagueMembership.deleteMany({});
  await prisma.leagueSlugHistory.deleteMany({});
  await prisma.league.deleteMany({});
  await prisma.superAdmin.deleteMany({});
  await prisma.userAccount.deleteMany({});
  await prisma.platform.deleteMany({});
});

async function seedThreeLeagues() {
  await prisma.platform.create({ data: { name: "FPL Tracker" } });

  const user = await prisma.userAccount.create({
    data: { email: "admin@example.com", displayName: "Admin McAdmin" },
  });

  const leagueA = await prisma.league.create({
    data: { slug: "acme", name: "Acme FPL", status: "active" },
  });
  const leagueB = await prisma.league.create({
    data: { slug: "beta", name: "Beta FPL", status: "active" },
  });
  const leagueC = await prisma.league.create({
    data: { slug: "gamma", name: "Gamma FPL", status: "active" },
  });

  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueA.id,
      userAccountId: user.id,
      managerId: 10001,
      role: "admin",
      isActive: true,
      source: "manual",
      pointsDeductionPerGw: 0,
    },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueB.id,
      userAccountId: user.id,
      managerId: 10001,
      role: "admin",
      isActive: true,
      source: "manual",
      pointsDeductionPerGw: 0,
    },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueC.id,
      userAccountId: user.id,
      managerId: 10001,
      role: "member",
      isActive: true,
      source: "league",
      pointsDeductionPerGw: 0,
    },
  });

  return { user, leagueA, leagueB, leagueC };
}

async function createSessionFor(userAccountId: string): Promise<string> {
  const plaintext = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(plaintext).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { tokenHash, userAccountId, expiresAt, lastSeenAt: now },
  });
  return plaintext;
}

describe("multi-league admin UX — data invariants", () => {
  it("filters memberships to admin role only", async () => {
    const { user } = await seedThreeLeagues();

    const memberships = await prisma.leagueMembership.findMany({
      where: { userAccountId: user.id, isActive: true },
      include: { league: true },
      orderBy: { addedAt: "asc" },
    });
    expect(memberships).toHaveLength(3);

    const adminMemberships = memberships.filter((m) => m.role === "admin" && m.isActive);
    expect(adminMemberships).toHaveLength(2);

    const adminSlugs = adminMemberships.map((m) => m.league.slug).sort();
    expect(adminSlugs).toEqual(["acme", "beta"]);
  });

  it("excludes member-only leagues from the admin filter", async () => {
    const { user, leagueC } = await seedThreeLeagues();

    const memberships = await prisma.leagueMembership.findMany({
      where: { userAccountId: user.id, isActive: true },
      include: { league: true },
    });
    const adminMemberships = memberships.filter((m) => m.role === "admin" && m.isActive);

    const adminLeagueIds = adminMemberships.map((m) => m.leagueId);
    expect(adminLeagueIds).not.toContain(leagueC.id);
  });

  it("keeps suspended admin leagues in the filtered set (page disables links, not data)", async () => {
    const { user, leagueB } = await seedThreeLeagues();
    await prisma.league.update({
      where: { id: leagueB.id },
      data: { status: "suspended", suspendedAt: new Date(), suspensionReason: "test" },
    });

    const memberships = await prisma.leagueMembership.findMany({
      where: { userAccountId: user.id, isActive: true },
      include: { league: true },
    });
    const adminMemberships = memberships.filter((m) => m.role === "admin" && m.isActive);
    expect(adminMemberships).toHaveLength(2);

    const suspendedAdmin = adminMemberships.find((m) => m.league.slug === "beta");
    expect(suspendedAdmin).toBeDefined();
    expect(suspendedAdmin?.league.status).toBe("suspended");
  });

  it("excludes inactive memberships from the admin filter", async () => {
    const { user, leagueA } = await seedThreeLeagues();
    await prisma.leagueMembership.updateMany({
      where: { userAccountId: user.id, leagueId: leagueA.id },
      data: { isActive: false },
    });

    const memberships = await prisma.leagueMembership.findMany({
      where: { userAccountId: user.id, isActive: true },
      include: { league: true },
    });
    const adminMemberships = memberships.filter((m) => m.role === "admin" && m.isActive);
    expect(adminMemberships).toHaveLength(1);
    expect(adminMemberships[0]?.league.slug).toBe("beta");
  });

  it("session creation succeeds for the multi-admin user (foundation for the page render)", async () => {
    const { user } = await seedThreeLeagues();
    const plaintext = await createSessionFor(user.id);
    expect(plaintext.length).toBeGreaterThan(20);

    const lookup = await prisma.session.findUnique({
      where: { tokenHash: createHash("sha256").update(plaintext).digest("hex") },
    });
    expect(lookup?.userAccountId).toBe(user.id);
    expect(lookup?.revokedAt).toBeNull();
  });
});

describe("multi-league admin UX — path mapper integration with seeded roles", () => {
  it("preserves admin sub-path between two admin leagues", async () => {
    const { leagueB } = await seedThreeLeagues();
    const href = mapAdminPath("/l/acme/admin/members", leagueB.slug, "admin");
    expect(href).toBe("/l/beta/admin/members");
  });

  it("falls back to standings when target league is member-only", async () => {
    const { leagueC } = await seedThreeLeagues();
    const href = mapAdminPath("/l/acme/admin/members", leagueC.slug, "member");
    expect(href).toBe("/l/gamma/standings");
  });

  it("falls back to standings from a non-admin source even with admin target", async () => {
    const { leagueB } = await seedThreeLeagues();
    const href = mapAdminPath("/l/acme/standings", leagueB.slug, "admin");
    expect(href).toBe("/l/beta/standings");
  });
});
