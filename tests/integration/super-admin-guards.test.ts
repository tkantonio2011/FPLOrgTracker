/**
 * Tests the data invariants behind `requireSuperAdmin` — the gate on every
 * /api/platform/... endpoint and every page under (main)/platform/...
 *
 * The route-level chain is: getServerUser(req) → user || throw NotSignedInError
 *                            → user.userAccount.isSuperAdmin || throw NotAuthorisedError
 *
 * `isSuperAdmin` is derived in `getServerUser` as:
 *   !!account.superAdmin && !account.superAdmin.revokedAt
 *
 * The tests verify the data states this query distinguishes:
 *   - no SuperAdmin row → flag false → handler returns 403
 *   - revoked SuperAdmin row → flag false → handler returns 403
 *   - active SuperAdmin row → flag true → handler proceeds
 *   - disabled UserAccount → getServerUser returns null → handler returns 401
 *   - bootstrap path: BOOTSTRAP_SUPER_ADMIN_EMAIL upserts the user + grant
 *
 * Mirrors the precedent set by `admin-role-guard.test.ts` and
 * `last-admin-guard.test.ts`. Route-level HTTP coverage is a future
 * follow-up; this pins the data invariants the gate relies on.
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

/** Replicates the same derivation `getServerUser` runs. Returns the gate's
 * decision: 'unauthenticated' (401), 'forbidden' (403), or 'allowed'. */
async function evaluateGate(userAccountId: string | null): Promise<"unauthenticated" | "forbidden" | "allowed"> {
  if (!userAccountId) return "unauthenticated";
  const account = await prisma.userAccount.findUnique({
    where: { id: userAccountId },
    include: { superAdmin: true },
  });
  if (!account) return "unauthenticated";
  // getServerUser explicitly returns null for disabled accounts → 401 surface.
  if (account.disabledAt) return "unauthenticated";
  const isSuperAdmin = !!account.superAdmin && !account.superAdmin.revokedAt;
  if (!isSuperAdmin) return "forbidden";
  return "allowed";
}

describe("requireSuperAdmin gate data invariants", () => {
  it("unsigned request → 401 (handler returns NotSignedInError)", async () => {
    expect(await evaluateGate(null)).toBe("unauthenticated");
  });

  it("plain UserAccount with no SuperAdmin row → 403 (forbidden)", async () => {
    const account = await prisma.userAccount.create({ data: { email: "plain@test" } });
    expect(await evaluateGate(account.id)).toBe("forbidden");
  });

  it("UserAccount with revoked SuperAdmin row → 403 (revocation removes the bypass)", async () => {
    const account = await prisma.userAccount.create({ data: { email: "ex-super@test" } });
    await prisma.superAdmin.create({
      data: { userAccountId: account.id, revokedAt: new Date() },
    });
    expect(await evaluateGate(account.id)).toBe("forbidden");
  });

  it("UserAccount with active SuperAdmin row → allowed", async () => {
    const account = await prisma.userAccount.create({ data: { email: "super@test" } });
    await prisma.superAdmin.create({ data: { userAccountId: account.id } });
    expect(await evaluateGate(account.id)).toBe("allowed");
  });

  it("disabled UserAccount → 401 (getServerUser returns null, same surface as unsigned)", async () => {
    const account = await prisma.userAccount.create({
      data: { email: "disabled@test", disabledAt: new Date() },
    });
    await prisma.superAdmin.create({ data: { userAccountId: account.id } });
    // Even with an active SuperAdmin row, disabled accounts can't reach the gate.
    expect(await evaluateGate(account.id)).toBe("unauthenticated");
  });

  it("League Admin of a league does NOT pass — league-scope admin is unrelated to platform-scope", async () => {
    const account = await prisma.userAccount.create({ data: { email: "league-admin@test" } });
    const league = await prisma.league.create({ data: { slug: "alpha", name: "Alpha" } });
    await prisma.leagueMembership.create({
      data: {
        leagueId: league.id,
        userAccountId: account.id,
        managerId: 100,
        role: "admin",
        source: "manual",
        isActive: true,
      },
    });
    expect(await evaluateGate(account.id)).toBe("forbidden");
  });

  it("Plain member of any league → 403", async () => {
    const account = await prisma.userAccount.create({ data: { email: "member@test" } });
    const league = await prisma.league.create({ data: { slug: "beta", name: "Beta" } });
    await prisma.leagueMembership.create({
      data: {
        leagueId: league.id,
        userAccountId: account.id,
        managerId: 200,
        role: "member",
        source: "manual",
        isActive: true,
      },
    });
    expect(await evaluateGate(account.id)).toBe("forbidden");
  });

  it("bootstrap path: upserting (UserAccount + SuperAdmin) for an env-listed email flips the gate to allowed", async () => {
    // Replicate `ensureBootstrapSuperAdmin` for a fresh email.
    const email = "bootstrap@test";
    const account = await prisma.userAccount.upsert({
      where: { email },
      update: {},
      create: { email },
    });
    const existing = await prisma.superAdmin.findUnique({ where: { userAccountId: account.id } });
    if (!existing) {
      await prisma.superAdmin.create({ data: { userAccountId: account.id } });
    } else if (existing.revokedAt) {
      await prisma.superAdmin.update({
        where: { id: existing.id },
        data: { revokedAt: null, revokedByUserAccountId: null },
      });
    }
    expect(await evaluateGate(account.id)).toBe("allowed");

    // Idempotent rerun — still allowed, no extra rows.
    await prisma.userAccount.upsert({ where: { email }, update: {}, create: { email } });
    expect(await evaluateGate(account.id)).toBe("allowed");
    const superCount = await prisma.superAdmin.count({ where: { userAccountId: account.id } });
    expect(superCount).toBe(1);
  });

  it("re-granting after revoke clears revokedAt and re-allows", async () => {
    const account = await prisma.userAccount.create({ data: { email: "re-granted@test" } });
    const row = await prisma.superAdmin.create({
      data: { userAccountId: account.id, revokedAt: new Date() },
    });
    expect(await evaluateGate(account.id)).toBe("forbidden");

    // T080 POST path: clear revokedAt.
    await prisma.superAdmin.update({
      where: { id: row.id },
      data: { revokedAt: null, revokedByUserAccountId: null },
    });
    expect(await evaluateGate(account.id)).toBe("allowed");
  });
});
