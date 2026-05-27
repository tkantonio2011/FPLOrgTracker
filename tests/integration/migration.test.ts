/**
 * 002-multi-league migration test (T092).
 *
 * Provisions a temporary SQLite DB, seeds it with a representative legacy
 * dataset (Organisation + Members + Users with passwordHash), then runs the
 * actual migration script (`prisma/migrations/002_multi_league/seed.ts`)
 * as a subprocess with `DATABASE_URL`, `BOOTSTRAP_SUPER_ADMIN_EMAIL`, and
 * `BOOTSTRAP_LEAGUE_ADMIN_EMAIL` set against the test DB, and verifies the
 * output state via Prisma.
 *
 * Re-runs the seed and asserts no duplicates (idempotency).
 *
 * **Deviation from the original task description**: the expand-only strategy
 * means legacy tables (Organisation, Member, User) are NOT renamed to
 * `_legacy_*`; they remain in the schema. The test verifies legacy rows are
 * left intact rather than absent from the Prisma client.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

let dbDir: string;
let dbUrl: string;
let prisma: PrismaClient;

const REPO_ROOT = join(__dirname, "..", "..");
const SEED_SCRIPT = join(REPO_ROOT, "prisma", "migrations", "002_multi_league", "seed.ts");

const BOOTSTRAP_SUPER_ADMIN_EMAIL = "super-admin@test";
const BOOTSTRAP_LEAGUE_ADMIN_EMAIL = "league-admin@test";

beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), "fpl-migration-test-"));
  const dbPath = join(dbDir, "test.db");
  dbUrl = `file:${dbPath}`;
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "ignore",
    cwd: REPO_ROOT,
  });
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
}, 60_000);

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (dbDir) rmSync(dbDir, { recursive: true, force: true });
});

async function seedLegacyDataset(): Promise<void> {
  // 1 legacy Organisation.
  const org = await prisma.organisation.create({
    data: {
      name: "FPL Demo League",
      miniLeagueId: 12345,
      digestPrompt: "be witty",
    },
  });

  // 5 Members — 3 with email, 2 without. Mixed source values.
  const memberSpec: Array<{
    managerId: number;
    displayName: string;
    teamName: string;
    email: string | null;
    source: "league" | "manual";
  }> = [
    { managerId: 1001, displayName: "Alice", teamName: "Alpha FC", email: "league-admin@test", source: "league" },
    { managerId: 1002, displayName: "Bob", teamName: "Bravo FC", email: "bob@test", source: "league" },
    { managerId: 1003, displayName: "Carol", teamName: "Charlie FC", email: "carol@test", source: "manual" },
    { managerId: 1004, displayName: "Dave", teamName: "Delta FC", email: null, source: "manual" },
    { managerId: 1005, displayName: "Eve", teamName: "Echo FC", email: null, source: "league" },
  ];
  for (const m of memberSpec) {
    await prisma.member.create({
      data: {
        organisationId: org.id,
        managerId: m.managerId,
        displayName: m.displayName,
        teamName: m.teamName,
        email: m.email,
        source: m.source,
        pointsDeductionPerGw: 0,
        isActive: true,
      },
    });
  }

  // 2 legacy Users with passwordHash + lastLoginAt.
  await prisma.user.create({
    data: {
      managerId: 1001,
      passwordHash: "$2a$12$dummy.hash.alice",
      lastLoginAt: new Date("2026-04-01T10:00:00Z"),
    },
  });
  await prisma.user.create({
    data: {
      managerId: 1002,
      passwordHash: "$2a$12$dummy.hash.bob",
      lastLoginAt: new Date("2026-04-05T15:30:00Z"),
    },
  });
}

function runMigration(): void {
  try {
    execSync(`npx tsx "${SEED_SCRIPT}"`, {
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        BOOTSTRAP_SUPER_ADMIN_EMAIL,
        BOOTSTRAP_LEAGUE_ADMIN_EMAIL,
      },
      stdio: ["ignore", "pipe", "pipe"],
      cwd: REPO_ROOT,
    });
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer; message: string };
    const stderr = e.stderr?.toString() ?? "";
    const stdout = e.stdout?.toString() ?? "";
    throw new Error(`Migration seed failed:\n${e.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
}

describe("002 multi-league migration", () => {
  it("seeds legacy data, runs the migration, and produces the expected platform state", async () => {
    await seedLegacyDataset();
    runMigration();

    // 1 Platform singleton.
    expect(await prisma.platform.count()).toBe(1);

    // 1 League.
    const leagues = await prisma.league.findMany();
    expect(leagues).toHaveLength(1);
    expect(leagues[0]?.name).toBe("FPL Demo League");
    expect(leagues[0]?.miniLeagueId).toBe(12345);
    expect(leagues[0]?.digestPrompt).toBe("be witty");

    // 5 LeagueMemberships — 3 with linked UserAccount, 2 without.
    const memberships = await prisma.leagueMembership.findMany({
      where: { leagueId: leagues[0]!.id },
      include: { userAccount: true },
    });
    expect(memberships).toHaveLength(5);
    const withAccount = memberships.filter((m) => m.userAccountId !== null);
    const withoutAccount = memberships.filter((m) => m.userAccountId === null);
    expect(withAccount).toHaveLength(3);
    expect(withoutAccount).toHaveLength(2);

    // Exactly one admin (the BOOTSTRAP_LEAGUE_ADMIN_EMAIL match).
    const admins = memberships.filter((m) => m.role === "admin");
    expect(admins).toHaveLength(1);
    expect(admins[0]?.userAccount?.email).toBe(BOOTSTRAP_LEAGUE_ADMIN_EMAIL);

    // UserAccount.lastLoginAt is carried over from legacy User for matching
    // managerIds where the member has an email.
    const aliceAccount = await prisma.userAccount.findUnique({
      where: { email: BOOTSTRAP_LEAGUE_ADMIN_EMAIL },
    });
    expect(aliceAccount?.lastLoginAt?.toISOString()).toBe("2026-04-01T10:00:00.000Z");
    const bobAccount = await prisma.userAccount.findUnique({
      where: { email: "bob@test" },
    });
    expect(bobAccount?.lastLoginAt?.toISOString()).toBe("2026-04-05T15:30:00.000Z");

    // SuperAdmin (from BOOTSTRAP_SUPER_ADMIN_EMAIL).
    const supers = await prisma.superAdmin.findMany({ where: { revokedAt: null } });
    expect(supers).toHaveLength(1);
    const superAccount = await prisma.userAccount.findUnique({
      where: { id: supers[0]!.userAccountId },
    });
    expect(superAccount?.email).toBe(BOOTSTRAP_SUPER_ADMIN_EMAIL);

    // AuditEvent: at least one `league.created` AND one `migration.completed`.
    const leagueCreated = await prisma.auditEvent.findFirst({
      where: { action: "league.created", leagueId: leagues[0]!.id },
    });
    expect(leagueCreated).not.toBeNull();
    const migrationCompleted = await prisma.auditEvent.findFirst({
      where: { action: "migration.completed", leagueId: leagues[0]!.id },
    });
    expect(migrationCompleted).not.toBeNull();

    // Source values preserved: members with `source: "league"` → membership.source === "league".
    const sourceLeagueCount = memberships.filter((m) => m.source === "league").length;
    expect(sourceLeagueCount).toBe(3); // Alice, Bob, Eve

    // Legacy tables are still readable (expand-only strategy — they are NOT
    // renamed to _legacy_*; they remain in the schema until the contract
    // migration). Verify rows are not modified by the seed.
    const legacyOrgs = await prisma.organisation.findMany();
    expect(legacyOrgs).toHaveLength(1);
    expect(legacyOrgs[0]?.name).toBe("FPL Demo League");
    const legacyMembers = await prisma.member.findMany();
    expect(legacyMembers).toHaveLength(5);
    const legacyUsers = await prisma.user.findMany();
    expect(legacyUsers).toHaveLength(2);
    expect(legacyUsers.every((u) => u.passwordHash.length > 0)).toBe(true);
  }, 120_000);

  it("re-running the migration is idempotent (no duplicates)", async () => {
    // The first run already happened in the previous test. The test order
    // matters: vitest runs tests sequentially within a file. Re-run and
    // verify counts haven't moved.
    const before = {
      leagues: await prisma.league.count(),
      memberships: await prisma.leagueMembership.count(),
      userAccounts: await prisma.userAccount.count(),
      supers: await prisma.superAdmin.count(),
      leagueCreatedEvents: await prisma.auditEvent.count({
        where: { action: "league.created" },
      }),
      migrationCompletedEvents: await prisma.auditEvent.count({
        where: { action: "migration.completed" },
      }),
    };

    runMigration();

    const after = {
      leagues: await prisma.league.count(),
      memberships: await prisma.leagueMembership.count(),
      userAccounts: await prisma.userAccount.count(),
      supers: await prisma.superAdmin.count(),
      leagueCreatedEvents: await prisma.auditEvent.count({
        where: { action: "league.created" },
      }),
      migrationCompletedEvents: await prisma.auditEvent.count({
        where: { action: "migration.completed" },
      }),
    };

    expect(after.leagues).toBe(before.leagues);
    expect(after.memberships).toBe(before.memberships);
    expect(after.userAccounts).toBe(before.userAccounts);
    expect(after.supers).toBe(before.supers);
    // The seed early-returns when the slug is already taken; it does NOT
    // emit a new `league.created` or `migration.completed` row on re-run.
    expect(after.leagueCreatedEvents).toBe(before.leagueCreatedEvents);
    expect(after.migrationCompletedEvents).toBe(before.migrationCompletedEvents);
  }, 120_000);
});
