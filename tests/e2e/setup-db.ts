/**
 * E2E test database setup.
 *
 * Runs before `playwright test`. Creates a fresh temp SQLite database under
 * `prisma/e2e-test.db`, pushes the schema, seeds two leagues with one member
 * in League A, and writes a session token + league metadata to
 * `tests/e2e/.fixture.json` for the spec to read.
 *
 * Idempotent: drops and recreates the DB on every run so tests start from a
 * known state. The path matches `DATABASE_URL` in `playwright.config.ts`.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const REPO_ROOT = join(__dirname, "..", "..");
const DB_PATH = join(REPO_ROOT, "prisma", "e2e-test.db");
const FIXTURE_PATH = join(__dirname, ".fixture.json");
const DB_URL = `file:${DB_PATH.replace(/\\/g, "/")}`;

interface LeagueRef {
  id: string;
  slug: string;
  name: string;
}

interface Fixture {
  leagueA: LeagueRef;
  leagueB: LeagueRef;
  member: { email: string; managerId: number };
  sessionPlaintext: string;
  // Phase 8 multi-admin sweep fixtures (user holds admin on C+D, member on E).
  multiAdmin: {
    email: string;
    sessionPlaintext: string;
    leagueC: LeagueRef; // admin
    leagueD: LeagueRef; // admin (suspended in the suspension test)
    leagueE: LeagueRef; // member
  };
}

async function main(): Promise<void> {
  for (const suffix of ["", "-shm", "-wal"]) {
    const path = DB_PATH + suffix;
    if (existsSync(path)) rmSync(path, { force: true });
  }

  mkdirSync(join(REPO_ROOT, "prisma"), { recursive: true });

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

  try {
    await prisma.platform.create({ data: {} });

    const member = await prisma.userAccount.create({
      data: { email: "member-a@e2e.test" },
    });

    const leagueA = await prisma.league.create({
      data: {
        slug: "alpha-e2e",
        name: "Alpha E2E League",
        createdByUserAccountId: member.id,
      },
    });
    const leagueB = await prisma.league.create({
      data: {
        slug: "bravo-e2e",
        name: "Bravo E2E League",
        createdByUserAccountId: member.id,
      },
    });

    await prisma.leagueMembership.create({
      data: {
        leagueId: leagueA.id,
        userAccountId: member.id,
        managerId: 999001,
        displayName: "E2E Alice",
        teamName: "Alpha Squad",
        role: "member",
        source: "manual",
        isActive: true,
      },
    });

    const sessionPlaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(sessionPlaintext).digest("hex");
    await prisma.session.create({
      data: {
        tokenHash,
        userAccountId: member.id,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    // Phase 8 — multi-admin user holds admin on C+D, member on E.
    const multiAdmin = await prisma.userAccount.create({
      data: { email: "multi-admin@e2e.test" },
    });

    const leagueC = await prisma.league.create({
      data: { slug: "charlie-e2e", name: "Charlie League", createdByUserAccountId: multiAdmin.id },
    });
    const leagueD = await prisma.league.create({
      data: { slug: "delta-e2e", name: "Delta League", createdByUserAccountId: multiAdmin.id },
    });
    const leagueE = await prisma.league.create({
      data: { slug: "echo-e2e", name: "Echo League", createdByUserAccountId: multiAdmin.id },
    });

    for (const [league, role, managerId] of [
      [leagueC, "admin", 999100],
      [leagueD, "admin", 999101],
      [leagueE, "member", 999102],
    ] as const) {
      await prisma.leagueMembership.create({
        data: {
          leagueId: league.id,
          userAccountId: multiAdmin.id,
          managerId,
          displayName: `Multi Admin ${league.slug}`,
          teamName: `${league.name} Squad`,
          role,
          source: "manual",
          isActive: true,
        },
      });
    }

    const multiAdminSession = randomBytes(32).toString("base64url");
    const multiAdminHash = createHash("sha256").update(multiAdminSession).digest("hex");
    await prisma.session.create({
      data: {
        tokenHash: multiAdminHash,
        userAccountId: multiAdmin.id,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    const fixture: Fixture = {
      leagueA: { id: leagueA.id, slug: leagueA.slug, name: leagueA.name },
      leagueB: { id: leagueB.id, slug: leagueB.slug, name: leagueB.name },
      member: { email: member.email, managerId: 999001 },
      sessionPlaintext,
      multiAdmin: {
        email: multiAdmin.email,
        sessionPlaintext: multiAdminSession,
        leagueC: { id: leagueC.id, slug: leagueC.slug, name: leagueC.name },
        leagueD: { id: leagueD.id, slug: leagueD.slug, name: leagueD.name },
        leagueE: { id: leagueE.id, slug: leagueE.slug, name: leagueE.name },
      },
    };

    writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
    process.stdout.write(`E2E DB ready at ${DB_PATH}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`[e2e setup] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
