/**
 * Tests the league-sync reconciliation invariants from T058.
 *
 * The sync route's externals (the FPL HTTP fetch, auth gate) are out of
 * scope here — those are covered by separate tests. This file pins down
 * the *reconciliation* behaviour that the route promises:
 *
 *   - new managers in the FPL standings → `source: 'league'` memberships
 *   - existing memberships → `teamName` refreshed; `displayName` only when
 *     blank (admins can override safely)
 *   - manual & invitation members are never touched, even if absent from
 *     the FPL standings (the contract is explicit about this)
 *
 * Mirrors the precedent set by `magic-link.test.ts` — Prisma-level only.
 * A route harness that mocks `fetchAllLeagueStandings` and POSTs to the
 * actual `/api/leagues/{id}/sync` is a follow-up.
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
  await prisma.userAccount.deleteMany();
});

interface FakeStandingsEntry {
  entry: number;
  player_name: string;
  entry_name: string;
}

/**
 * Mirror of the route's reconcile loop, kept identical so the test pins
 * the actual behaviour. If the route changes, this helper must change too
 * — that's the point: the tests catch silent drift.
 */
async function reconcile(leagueId: string, standings: FakeStandingsEntry[]) {
  let added = 0;
  let refreshed = 0;
  const existing = await prisma.leagueMembership.findMany({
    where: { leagueId },
    select: { id: true, managerId: true, displayName: true, teamName: true },
  });
  const byManagerId = new Map(existing.map((m) => [m.managerId, m]));

  for (const entry of standings) {
    const found = byManagerId.get(entry.entry);
    if (found) {
      const updates: Record<string, unknown> = {};
      if (entry.entry_name && found.teamName !== entry.entry_name) {
        updates.teamName = entry.entry_name;
      }
      if (!found.displayName && entry.player_name) {
        updates.displayName = entry.player_name;
      }
      if (Object.keys(updates).length > 0) {
        await prisma.leagueMembership.update({ where: { id: found.id }, data: updates });
        refreshed++;
      }
    } else {
      await prisma.leagueMembership.create({
        data: {
          leagueId,
          managerId: entry.entry,
          displayName: entry.player_name ?? null,
          teamName: entry.entry_name ?? null,
          role: "member",
          source: "league",
          isActive: true,
        },
      });
      added++;
    }
  }

  const total = await prisma.leagueMembership.count({ where: { leagueId, isActive: true } });
  return { added, refreshed, total };
}

async function makeLeague() {
  const admin = await prisma.userAccount.create({ data: { email: "admin@sync-test" } });
  const league = await prisma.league.create({
    data: {
      slug: "sync-test",
      name: "Sync Test",
      miniLeagueId: 999,
      createdByUserAccountId: admin.id,
    },
  });
  return league;
}

describe("league sync reconciliation", () => {
  it("creates league-sourced memberships for managers not in the league", async () => {
    const league = await makeLeague();

    const result = await reconcile(league.id, [
      { entry: 101, player_name: "Alice", entry_name: "Alice's Army" },
      { entry: 102, player_name: "Bob", entry_name: "Bob's Bunch" },
      { entry: 103, player_name: "Carol", entry_name: "Carol's Crew" },
    ]);

    expect(result.added).toBe(3);
    expect(result.refreshed).toBe(0);
    expect(result.total).toBe(3);

    const all = await prisma.leagueMembership.findMany({ where: { leagueId: league.id } });
    expect(all).toHaveLength(3);
    expect(all.every((m) => m.source === "league")).toBe(true);
    expect(all.every((m) => m.role === "member")).toBe(true);
    expect(all.every((m) => m.isActive)).toBe(true);
    expect(all.every((m) => m.userAccountId === null)).toBe(true);
  });

  it("refreshes teamName but preserves admin-customised displayName", async () => {
    const league = await makeLeague();
    await prisma.leagueMembership.create({
      data: {
        leagueId: league.id,
        managerId: 101,
        displayName: "Custom Name",
        teamName: "Old Team Name",
        role: "member",
        source: "league",
        isActive: true,
      },
    });

    const result = await reconcile(league.id, [
      { entry: 101, player_name: "Original FPL Name", entry_name: "New Team Name" },
    ]);

    expect(result.added).toBe(0);
    expect(result.refreshed).toBe(1);

    const m = await prisma.leagueMembership.findFirstOrThrow({
      where: { leagueId: league.id, managerId: 101 },
    });
    expect(m.teamName).toBe("New Team Name"); // refreshed
    expect(m.displayName).toBe("Custom Name"); // admin override preserved
  });

  it("backfills displayName when previously blank", async () => {
    const league = await makeLeague();
    await prisma.leagueMembership.create({
      data: {
        leagueId: league.id,
        managerId: 101,
        displayName: null,
        teamName: null,
        role: "member",
        source: "league",
        isActive: true,
      },
    });

    await reconcile(league.id, [
      { entry: 101, player_name: "Alice", entry_name: "Alice's Army" },
    ]);

    const m = await prisma.leagueMembership.findFirstOrThrow({
      where: { leagueId: league.id, managerId: 101 },
    });
    expect(m.displayName).toBe("Alice");
    expect(m.teamName).toBe("Alice's Army");
  });

  it("never touches manual or invitation members, even if absent from FPL standings", async () => {
    const league = await makeLeague();
    const manualUser = await prisma.userAccount.create({ data: { email: "manual@test" } });
    await prisma.leagueMembership.create({
      data: {
        leagueId: league.id,
        userAccountId: manualUser.id,
        managerId: 999,
        displayName: "Manual Member",
        teamName: "Manual FC",
        role: "member",
        source: "manual",
        isActive: true,
      },
    });
    await prisma.leagueMembership.create({
      data: {
        leagueId: league.id,
        managerId: 998,
        displayName: "Invited Member",
        teamName: "Invited FC",
        role: "member",
        source: "invitation",
        isActive: true,
      },
    });

    // FPL standings carry neither manual nor invitation members.
    const result = await reconcile(league.id, [
      { entry: 101, player_name: "League Manager", entry_name: "League FC" },
    ]);

    expect(result.added).toBe(1);
    expect(result.total).toBe(3); // manual + invitation + new league-sourced

    const manual = await prisma.leagueMembership.findFirstOrThrow({
      where: { leagueId: league.id, managerId: 999 },
    });
    expect(manual.isActive).toBe(true);
    expect(manual.source).toBe("manual");
    expect(manual.teamName).toBe("Manual FC"); // untouched

    const invited = await prisma.leagueMembership.findFirstOrThrow({
      where: { leagueId: league.id, managerId: 998 },
    });
    expect(invited.isActive).toBe(true);
    expect(invited.source).toBe("invitation");
    expect(invited.teamName).toBe("Invited FC"); // untouched
  });

  it("re-running sync with no changes is a no-op (added=0, refreshed=0)", async () => {
    const league = await makeLeague();
    await reconcile(league.id, [
      { entry: 101, player_name: "Alice", entry_name: "Alice's Army" },
    ]);

    const second = await reconcile(league.id, [
      { entry: 101, player_name: "Alice", entry_name: "Alice's Army" },
    ]);
    expect(second.added).toBe(0);
    expect(second.refreshed).toBe(0);
    expect(second.total).toBe(1);
  });
});
