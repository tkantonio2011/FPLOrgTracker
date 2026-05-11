/**
 * Tests the data invariants behind the "last admin" guard that fires from
 * both the league-scoped membership PATCH (T060) and the platform-scoped
 * membership role PATCH (T078).
 *
 * Both endpoints share the same data check: count active admins in the
 * league EXCLUDING the membership being acted on. If zero → 409.
 *
 * The data invariants tested:
 *   - demoting the only active admin → guard fires (count is 0)
 *   - removing the only active admin → guard fires (count is 0)
 *   - deactivating the only active admin → guard fires (count is 0)
 *   - with a second admin present, the guard does not fire (count is ≥1)
 *   - an inactive admin doesn't count toward "active admins" (deactivating
 *     them, or demoting them, is permitted regardless of how many remain)
 *
 * Mirrors the precedent set by `admin-role-guard.test.ts` — Prisma-level
 * verification of the conditions the route handlers check, without coupling
 * to the prod singleton.
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

/** The shared guard query the route handlers use. Returns true if the action
 * would leave the league with zero active admins (i.e. the route should 409).
 */
async function wouldStrandLeague(membershipId: string): Promise<boolean> {
  const target = await prisma.leagueMembership.findUnique({
    where: { id: membershipId },
  });
  if (!target) return false;
  if (target.role !== "admin" || !target.isActive) return false;
  const otherAdmins = await prisma.leagueMembership.count({
    where: {
      leagueId: target.leagueId,
      role: "admin",
      isActive: true,
      NOT: { id: target.id },
    },
  });
  return otherAdmins === 0;
}

async function seedLeagueWithOneAdmin(): Promise<{ leagueId: string; adminMembershipId: string; memberMembershipId: string }> {
  const adminAccount = await prisma.userAccount.create({ data: { email: "admin@test" } });
  const memberAccount = await prisma.userAccount.create({ data: { email: "member@test" } });
  const league = await prisma.league.create({
    data: { slug: "alpha", name: "Alpha" },
  });
  const admin = await prisma.leagueMembership.create({
    data: {
      leagueId: league.id,
      userAccountId: adminAccount.id,
      managerId: 100,
      role: "admin",
      source: "manual",
      isActive: true,
    },
  });
  const member = await prisma.leagueMembership.create({
    data: {
      leagueId: league.id,
      userAccountId: memberAccount.id,
      managerId: 101,
      role: "member",
      source: "manual",
      isActive: true,
    },
  });
  return { leagueId: league.id, adminMembershipId: admin.id, memberMembershipId: member.id };
}

describe("last-admin guard data invariants", () => {
  it("demoting the only active admin strands the league (guard fires)", async () => {
    const { adminMembershipId } = await seedLeagueWithOneAdmin();
    expect(await wouldStrandLeague(adminMembershipId)).toBe(true);
  });

  it("removing the only active admin strands the league (guard fires)", async () => {
    const { adminMembershipId } = await seedLeagueWithOneAdmin();
    // Same query — DELETE handler uses the identical guard.
    expect(await wouldStrandLeague(adminMembershipId)).toBe(true);
  });

  it("deactivating the only active admin strands the league (guard fires)", async () => {
    const { adminMembershipId } = await seedLeagueWithOneAdmin();
    // PATCH with isActive: false uses the same guard.
    expect(await wouldStrandLeague(adminMembershipId)).toBe(true);
  });

  it("with a second active admin present, the guard does not fire", async () => {
    const { leagueId, adminMembershipId } = await seedLeagueWithOneAdmin();
    const second = await prisma.userAccount.create({ data: { email: "second-admin@test" } });
    await prisma.leagueMembership.create({
      data: {
        leagueId,
        userAccountId: second.id,
        managerId: 102,
        role: "admin",
        source: "manual",
        isActive: true,
      },
    });
    expect(await wouldStrandLeague(adminMembershipId)).toBe(false);
  });

  it("the guard ignores inactive admins — an only-active admin is still single even if another inactive admin exists", async () => {
    const { leagueId, adminMembershipId } = await seedLeagueWithOneAdmin();
    const inactive = await prisma.userAccount.create({ data: { email: "inactive-admin@test" } });
    await prisma.leagueMembership.create({
      data: {
        leagueId,
        userAccountId: inactive.id,
        managerId: 103,
        role: "admin",
        source: "manual",
        isActive: false,
      },
    });
    expect(await wouldStrandLeague(adminMembershipId)).toBe(true);
  });

  it("the guard is a no-op for non-admin / inactive memberships (no 409 from member rows)", async () => {
    const { memberMembershipId } = await seedLeagueWithOneAdmin();
    // Acting on a member row never strands a league.
    expect(await wouldStrandLeague(memberMembershipId)).toBe(false);
  });

  it("the guard scopes to the membership's own league (cross-league admins don't count)", async () => {
    const { adminMembershipId } = await seedLeagueWithOneAdmin();
    // Add an admin in a completely separate league — does NOT relieve the guard
    // for the first league's only admin.
    const otherLeague = await prisma.league.create({ data: { slug: "bravo", name: "Bravo" } });
    const otherAdmin = await prisma.userAccount.create({ data: { email: "other-admin@test" } });
    await prisma.leagueMembership.create({
      data: {
        leagueId: otherLeague.id,
        userAccountId: otherAdmin.id,
        managerId: 200,
        role: "admin",
        source: "manual",
        isActive: true,
      },
    });
    expect(await wouldStrandLeague(adminMembershipId)).toBe(true);
  });
});
