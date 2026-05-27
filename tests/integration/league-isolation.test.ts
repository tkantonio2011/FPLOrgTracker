/**
 * SC-006 verifier: a member of league A cannot reach league B's data through
 * the API surface. Exercises the actual Next.js route handler (not the route's
 * Prisma helpers in isolation), so the entire chain
 *
 *   NextRequest → getSessionFromRequest → resolveLeague → requireLeagueMember
 *
 * is covered by this single test file. A regression in any of those layers —
 * the session cookie parser, the slug-or-id resolver, the membership filter,
 * or the suspended-league gate — fails one of these assertions.
 *
 * The FPL HTTP client is mocked so the handlers don't reach the public
 * fantasy.premierleague.com API during the test run.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// vi.mock hoists above all imports, so the route handler module — which is
// dynamically imported inside the tests — picks up the mocked FPL client.
vi.mock("@/lib/fpl/client", () => ({
  fetchAllLeagueStandings: vi.fn(),
  fetchBootstrap: vi.fn(),
  fetchEntryHistory: vi.fn(),
  fetchEntryPicks: vi.fn(),
  fetchLiveGw: vi.fn(),
  getCurrentGw: vi.fn(),
  isGameweekLive: vi.fn(),
}));

let dbDir: string;
let prisma: PrismaClient;
let dbUrl: string;

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), "fpl-test-iso-"));
  const dbPath = join(dbDir, "test.db");
  dbUrl = `file:${dbPath}`;
  // CRITICAL — set DATABASE_URL before any code path imports `@/lib/db`. The
  // route handler does so when dynamically imported in the test below; the
  // singleton picks up this URL.
  process.env.DATABASE_URL = dbUrl;
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  // Also disconnect the singleton client that the route handlers used. Without
  // this, Windows' rmSync of the SQLite directory races against still-open
  // file handles and fails with EPERM.
  try {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  } catch {
    // Module may not have been imported (no test invoked the route handler);
    // safe to ignore.
  }
  if (dbDir) {
    try {
      rmSync(dbDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup on Windows — tmpdir is OS-managed anyway.
    }
  }
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

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

async function createSessionFor(userAccountId: string): Promise<string> {
  const plaintext = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(plaintext);
  await prisma.session.create({
    data: {
      tokenHash,
      userAccountId,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  return plaintext;
}

interface SeedResult {
  leagueA: { id: string; slug: string };
  leagueB: { id: string; slug: string };
  memberA: { id: string; userAccountId: string; managerId: number };
  member2A: { managerId: number };
  memberB: { managerId: number };
  member2B: { managerId: number };
}

async function seedTwoLeaguesEach2Members(): Promise<SeedResult> {
  const accountA1 = await prisma.userAccount.create({ data: { email: "a1@test" } });
  const accountA2 = await prisma.userAccount.create({ data: { email: "a2@test" } });
  const accountB1 = await prisma.userAccount.create({ data: { email: "b1@test" } });
  const accountB2 = await prisma.userAccount.create({ data: { email: "b2@test" } });

  const leagueA = await prisma.league.create({
    data: { slug: "alpha", name: "Alpha", createdByUserAccountId: accountA1.id },
  });
  const leagueB = await prisma.league.create({
    data: { slug: "bravo", name: "Bravo", createdByUserAccountId: accountB1.id },
  });

  const memA1 = await prisma.leagueMembership.create({
    data: {
      leagueId: leagueA.id,
      userAccountId: accountA1.id,
      managerId: 1001,
      displayName: "Alice One",
      teamName: "Alpha Team A1",
      role: "admin",
      source: "manual",
      isActive: true,
    },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueA.id,
      userAccountId: accountA2.id,
      managerId: 1002,
      displayName: "Alice Two",
      teamName: "Alpha Team A2",
      role: "member",
      source: "manual",
      isActive: true,
    },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueB.id,
      userAccountId: accountB1.id,
      managerId: 2001,
      displayName: "Bob One",
      teamName: "Bravo Team B1",
      role: "admin",
      source: "manual",
      isActive: true,
    },
  });
  await prisma.leagueMembership.create({
    data: {
      leagueId: leagueB.id,
      userAccountId: accountB2.id,
      managerId: 2002,
      displayName: "Bob Two",
      teamName: "Bravo Team B2",
      role: "member",
      source: "manual",
      isActive: true,
    },
  });

  return {
    leagueA: { id: leagueA.id, slug: leagueA.slug },
    leagueB: { id: leagueB.id, slug: leagueB.slug },
    memberA: { id: memA1.id, userAccountId: accountA1.id, managerId: 1001 },
    member2A: { managerId: 1002 },
    memberB: { managerId: 2001 },
    member2B: { managerId: 2002 },
  };
}

function buildRequest(url: string, sessionToken: string | null) {
  // NextRequest accepts a standard Request URL/init. The route handler reads
  // cookies via req.cookies.get(...), which is parsed from the Cookie header.
  const headers: Record<string, string> = {};
  if (sessionToken) headers.cookie = `session=${sessionToken}`;
  // Construct via the Web Request → NextRequest wrapper. Importing NextRequest
  // dynamically keeps the test file independent of the global Next/runtime
  // initialisation, which is otherwise needed at module load.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextRequest } = require("next/server");
  return new NextRequest(url, { method: "GET", headers });
}

describe("SC-006: league isolation (route-level)", () => {
  it("member of A reaches /api/leagues/{A}/standings — 200 with only A's members", async () => {
    const seed = await seedTwoLeaguesEach2Members();
    const token = await createSessionFor(seed.memberA.userAccountId);

    // Stub the FPL client. miniLeagueId is null on the seeded leagues, so the
    // handler walks the per-member history branch.
    const fpl = await import("@/lib/fpl/client");
    (fpl.fetchBootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      events: [
        { id: 1, finished: false, is_current: true, average_entry_score: 50 },
      ],
    });
    (fpl.getCurrentGw as ReturnType<typeof vi.fn>).mockReturnValue(1);
    (fpl.isGameweekLive as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (fpl.fetchEntryHistory as ReturnType<typeof vi.fn>).mockImplementation(
      async (managerId: number) => ({
        current: [{ event: 1, points: 60 + managerId, total_points: 60 + managerId }],
        chips: [],
      }),
    );

    const { GET } = await import("@/app/api/leagues/[leagueId]/standings/route");
    const res = await GET(
      buildRequest(`http://localhost/api/leagues/${seed.leagueA.id}/standings`, token),
      { params: { leagueId: seed.leagueA.id } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.standings).toHaveLength(2);
    const managerIds = body.data.standings.map((s: { managerId: number }) => s.managerId).sort();
    expect(managerIds).toEqual([seed.memberA.managerId, seed.member2A.managerId]);
    // The negative assertion is the real SC-006 check: no B-side managerId
    // should be present.
    expect(managerIds).not.toContain(seed.memberB.managerId);
    expect(managerIds).not.toContain(seed.member2B.managerId);
  });

  it("member of A reaching /api/leagues/{B}/standings receives 404 (LeagueNotVisible)", async () => {
    const seed = await seedTwoLeaguesEach2Members();
    const token = await createSessionFor(seed.memberA.userAccountId);

    const { GET } = await import("@/app/api/leagues/[leagueId]/standings/route");
    const res = await GET(
      buildRequest(`http://localhost/api/leagues/${seed.leagueB.id}/standings`, token),
      { params: { leagueId: seed.leagueB.id } },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    // The error message is intentionally generic (non-disclosure of B's existence).
    expect(body.error).toBeTruthy();
  });

  it("unauthenticated request to /api/leagues/{A}/standings receives 401", async () => {
    const seed = await seedTwoLeaguesEach2Members();

    const { GET } = await import("@/app/api/leagues/[leagueId]/standings/route");
    const res = await GET(
      buildRequest(`http://localhost/api/leagues/${seed.leagueA.id}/standings`, null),
      { params: { leagueId: seed.leagueA.id } },
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("member of A reaching B by SLUG (not id) also receives 404 — slug resolution does not leak existence", async () => {
    const seed = await seedTwoLeaguesEach2Members();
    const token = await createSessionFor(seed.memberA.userAccountId);

    const { GET } = await import("@/app/api/leagues/[leagueId]/standings/route");
    // Pass the slug 'bravo' in place of an id. The resolver tries slug first,
    // succeeds, then the membership check fails → LeagueNotVisibleError.
    const res = await GET(
      buildRequest(`http://localhost/api/leagues/${seed.leagueB.slug}/standings`, token),
      { params: { leagueId: seed.leagueB.slug } },
    );

    expect(res.status).toBe(404);
  });

  it("revoked session is rejected — cookie present but no longer valid", async () => {
    const seed = await seedTwoLeaguesEach2Members();
    const token = await createSessionFor(seed.memberA.userAccountId);
    // Revoke the session.
    await prisma.session.updateMany({
      where: { userAccountId: seed.memberA.userAccountId },
      data: { revokedAt: new Date() },
    });

    const { GET } = await import("@/app/api/leagues/[leagueId]/standings/route");
    const res = await GET(
      buildRequest(`http://localhost/api/leagues/${seed.leagueA.id}/standings`, token),
      { params: { leagueId: seed.leagueA.id } },
    );

    expect(res.status).toBe(401);
  });

  it("suspended league: member of A receives 403 (LeagueSuspended) on their own league", async () => {
    const seed = await seedTwoLeaguesEach2Members();
    const token = await createSessionFor(seed.memberA.userAccountId);
    await prisma.league.update({
      where: { id: seed.leagueA.id },
      data: { status: "suspended", suspendedAt: new Date(), suspensionReason: "test" },
    });

    const { GET } = await import("@/app/api/leagues/[leagueId]/standings/route");
    const res = await GET(
      buildRequest(`http://localhost/api/leagues/${seed.leagueA.id}/standings`, token),
      { params: { leagueId: seed.leagueA.id } },
    );

    expect(res.status).toBe(403);
  });
});
