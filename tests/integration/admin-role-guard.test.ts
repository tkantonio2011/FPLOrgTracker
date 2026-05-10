/**
 * Tests the data invariants behind `requireLeagueAdmin` and the
 * "cannot demote/remove the last admin" guard.
 *
 * Prisma-level verification of the conditions the route handlers check:
 *   - league admin lookup (role === 'admin' && isActive)
 *   - cross-league membership absence (causes LeagueNotVisibleError)
 *   - last-admin reduction-to-zero detection
 *
 * Mirrors the precedent set by `magic-link.test.ts` — route-level coverage
 * that exercises the actual /api/leagues/{id}/members endpoints is a
 * follow-up that requires a full request harness.
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
  await prisma.superAdmin.deleteMany();
  await prisma.userAccount.deleteMany();
});

interface SeedResult {
  leagueA: { id: string };
  leagueB: { id: string };
  adminA: { id: string };
  adminB: { id: string };
  memberA: { id: string };
}

async function seedTwoLeagues(): Promise<SeedResult> {
  const adminA = await prisma.userAccount.create({ data: { email: "admin-a@test" } });
  const adminB = await prisma.userAccount.create({ data: { email: "admin-b@test" } });
  const memberA = await prisma.userAccount.create({ data: { email: "member-a@test" } });

  const leagueA = await prisma.league.create({
    data: { slug: "alpha", name: "Alpha", createdByUserAccountId: adminA.id },
  });
  const leagueB = await prisma.league.create({
    data: { slug: "bravo", name: "Bravo", createdByUserAccountId: adminB.id },
  });

  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueA.id,
      userAccountId: adminA.id,
      managerId: 100,
      role: "admin",
      source: "manual",
      isActive: true,
    },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueA.id,
      userAccountId: memberA.id,
      managerId: 101,
      role: "member",
      source: "manual",
      isActive: true,
    },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueB.id,
      userAccountId: adminB.id,
      managerId: 200,
      role: "admin",
      source: "manual",
      isActive: true,
    },
  });

  return {
    leagueA: { id: leagueA.id },
    leagueB: { id: leagueB.id },
    adminA: { id: adminA.id },
    adminB: { id: adminB.id },
    memberA: { id: memberA.id },
  };
}

describe("league admin authz invariants", () => {
  it("admin lookup recognises only role='admin' AND isActive=true", async () => {
    const { leagueA, adminA, memberA } = await seedTwoLeagues();

    const adminCheck = await prisma.leagueMembership.findFirst({
      where: { leagueId: leagueA.id, userAccountId: adminA.id, role: "admin", isActive: true },
    });
    expect(adminCheck).not.toBeNull();

    const memberCheck = await prisma.leagueMembership.findFirst({
      where: { leagueId: leagueA.id, userAccountId: memberA.id, role: "admin", isActive: true },
    });
    expect(memberCheck).toBeNull();

    // Deactivating an admin should remove them from the admin pool.
    await prisma.leagueMembership.updateMany({
      where: { leagueId: leagueA.id, userAccountId: adminA.id },
      data: { isActive: false },
    });
    const inactiveAdminCheck = await prisma.leagueMembership.findFirst({
      where: { leagueId: leagueA.id, userAccountId: adminA.id, role: "admin", isActive: true },
    });
    expect(inactiveAdminCheck).toBeNull();
  });

  it("admin of league A has no membership in league B (cross-league lookup is empty)", async () => {
    const { leagueB, adminA } = await seedTwoLeagues();

    const crossLookup = await prisma.leagueMembership.findUnique({
      where: { leagueId_userAccountId: { leagueId: leagueB.id, userAccountId: adminA.id } },
    });
    expect(crossLookup).toBeNull();
  });

  it("last-admin guard: counting active admins excluding the target detects single-admin leagues", async () => {
    const { leagueA, adminA } = await seedTwoLeagues();

    // League A has one admin (adminA) — removing them would leave zero.
    const targetMembership = await prisma.leagueMembership.findUniqueOrThrow({
      where: { leagueId_userAccountId: { leagueId: leagueA.id, userAccountId: adminA.id } },
    });
    const otherAdmins = await prisma.leagueMembership.count({
      where: {
        leagueId: leagueA.id,
        role: "admin",
        isActive: true,
        NOT: { id: targetMembership.id },
      },
    });
    expect(otherAdmins).toBe(0); // → handler returns 409

    // Promote a second admin and re-check.
    const second = await prisma.userAccount.create({ data: { email: "second-admin-a@test" } });
    await prisma.leagueMembership.create({
      data: {
        leagueId: leagueA.id,
        userAccountId: second.id,
        managerId: 102,
        role: "admin",
        source: "manual",
        isActive: true,
      },
    });

    const otherAdminsAfter = await prisma.leagueMembership.count({
      where: {
        leagueId: leagueA.id,
        role: "admin",
        isActive: true,
        NOT: { id: targetMembership.id },
      },
    });
    expect(otherAdminsAfter).toBe(1); // → handler now allows demote/remove
  });

  it("Super Admin row gates platform bypass independently of league memberships", async () => {
    const { adminB } = await seedTwoLeagues();

    // Plain user is not super-admin.
    let isSuper = await prisma.superAdmin.findFirst({ where: { userAccountId: adminB.id, revokedAt: null } });
    expect(isSuper).toBeNull();

    // Granting a SuperAdmin row flips the bypass flag.
    await prisma.superAdmin.create({ data: { userAccountId: adminB.id } });
    isSuper = await prisma.superAdmin.findFirst({ where: { userAccountId: adminB.id, revokedAt: null } });
    expect(isSuper).not.toBeNull();

    // Revoking sets revokedAt — the active-admin lookup should now miss.
    await prisma.superAdmin.update({
      where: { id: isSuper!.id },
      data: { revokedAt: new Date() },
    });
    isSuper = await prisma.superAdmin.findFirst({ where: { userAccountId: adminB.id, revokedAt: null } });
    expect(isSuper).toBeNull();
  });
});
