/**
 * Tests the data invariants behind league suspension.
 *
 * Prisma-level verification of the conditions the suspend/reinstate route
 * handlers (T076) and the resolver-side suspension gate (resolveLeague /
 * requireLeagueMember) rely on:
 *   - status flips active ↔ suspended cleanly
 *   - suspendedAt / suspendedByUserAccountId / suspensionReason are populated
 *     on suspend and cleared on reinstate
 *   - "already suspended" pre-check used by the suspend route
 *   - "not suspended" pre-check used by the reinstate route
 *   - the resolver-equivalent gate denies non-Super-Admin members of a
 *     suspended league and allows Super Admins through
 *
 * Mirrors the precedent set by `magic-link.test.ts` and `admin-role-guard.test.ts`
 * — route-level HTTP coverage is a future follow-up.
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
  leagueId: string;
  superAdminId: string;
  adminId: string;
  memberId: string;
}

async function seedLeagueWithMembers(): Promise<SeedResult> {
  const superAdminAccount = await prisma.userAccount.create({
    data: { email: "super@test" },
  });
  await prisma.superAdmin.create({ data: { userAccountId: superAdminAccount.id } });

  const adminAccount = await prisma.userAccount.create({ data: { email: "admin@test" } });
  const memberAccount = await prisma.userAccount.create({ data: { email: "member@test" } });

  const league = await prisma.league.create({
    data: {
      slug: "alpha",
      name: "Alpha",
      createdByUserAccountId: superAdminAccount.id,
    },
  });

  await prisma.leagueMembership.create({
    data: {
      leagueId: league.id,
      userAccountId: adminAccount.id,
      managerId: 100,
      role: "admin",
      source: "manual",
      isActive: true,
    },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: league.id,
      userAccountId: memberAccount.id,
      managerId: 101,
      role: "member",
      source: "manual",
      isActive: true,
    },
  });

  return {
    leagueId: league.id,
    superAdminId: superAdminAccount.id,
    adminId: adminAccount.id,
    memberId: memberAccount.id,
  };
}

describe("league suspension data invariants", () => {
  it("suspend populates status, suspendedAt, suspendedByUserAccountId, suspensionReason", async () => {
    const { leagueId, superAdminId } = await seedLeagueWithMembers();

    const before = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } });
    expect(before.status).toBe("active");
    expect(before.suspendedAt).toBeNull();
    expect(before.suspendedByUserAccountId).toBeNull();
    expect(before.suspensionReason).toBeNull();

    // Replicate the suspend-route data update.
    const updated = await prisma.league.update({
      where: { id: leagueId },
      data: {
        status: "suspended",
        suspendedAt: new Date(),
        suspendedByUserAccountId: superAdminId,
        suspensionReason: "Test reason",
      },
    });
    expect(updated.status).toBe("suspended");
    expect(updated.suspendedAt).toBeInstanceOf(Date);
    expect(updated.suspendedByUserAccountId).toBe(superAdminId);
    expect(updated.suspensionReason).toBe("Test reason");
  });

  it("reinstate clears suspension fields and flips status back to active", async () => {
    const { leagueId, superAdminId } = await seedLeagueWithMembers();
    await prisma.league.update({
      where: { id: leagueId },
      data: {
        status: "suspended",
        suspendedAt: new Date(),
        suspendedByUserAccountId: superAdminId,
        suspensionReason: "Test reason",
      },
    });

    const reinstated = await prisma.league.update({
      where: { id: leagueId },
      data: {
        status: "active",
        suspendedAt: null,
        suspendedByUserAccountId: null,
        suspensionReason: null,
      },
    });

    expect(reinstated.status).toBe("active");
    expect(reinstated.suspendedAt).toBeNull();
    expect(reinstated.suspendedByUserAccountId).toBeNull();
    expect(reinstated.suspensionReason).toBeNull();
  });

  it("suspend route's 'already suspended' guard fires when status is already 'suspended'", async () => {
    const { leagueId, superAdminId } = await seedLeagueWithMembers();
    await prisma.league.update({
      where: { id: leagueId },
      data: {
        status: "suspended",
        suspendedAt: new Date(),
        suspendedByUserAccountId: superAdminId,
      },
    });

    // The guard the route uses.
    const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } });
    const wouldReject = league.status === "suspended";
    expect(wouldReject).toBe(true);
  });

  it("reinstate route's 'not suspended' guard fires when status is already 'active'", async () => {
    const { leagueId } = await seedLeagueWithMembers();
    const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } });
    const wouldReject = league.status !== "suspended";
    expect(wouldReject).toBe(true);
  });

  it("resolver-side suspension gate denies non-Super-Admin members and allows Super Admins", async () => {
    const { leagueId, superAdminId, adminId, memberId } = await seedLeagueWithMembers();

    // Suspend the league.
    await prisma.league.update({
      where: { id: leagueId },
      data: {
        status: "suspended",
        suspendedAt: new Date(),
        suspendedByUserAccountId: superAdminId,
      },
    });

    // Simulate the resolver gate: league.status === 'suspended' && !isSuperAdmin → deny.
    async function gate(userAccountId: string): Promise<"allowed" | "suspended"> {
      const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } });
      const sa = await prisma.superAdmin.findFirst({
        where: { userAccountId, revokedAt: null },
      });
      const isSuperAdmin = sa !== null;
      if (league.status === "suspended" && !isSuperAdmin) return "suspended";
      return "allowed";
    }

    expect(await gate(memberId)).toBe("suspended");
    expect(await gate(adminId)).toBe("suspended"); // League Admin is blocked too
    expect(await gate(superAdminId)).toBe("allowed");

    // After reinstate, everyone is allowed again.
    await prisma.league.update({
      where: { id: leagueId },
      data: {
        status: "active",
        suspendedAt: null,
        suspendedByUserAccountId: null,
        suspensionReason: null,
      },
    });

    expect(await gate(memberId)).toBe("allowed");
    expect(await gate(adminId)).toBe("allowed");
    expect(await gate(superAdminId)).toBe("allowed");
  });
});
