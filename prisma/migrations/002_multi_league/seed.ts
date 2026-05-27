/**
 * 002 Multi-League Platform — data migration.
 *
 * Idempotent. Run via `npm run db:seed`.
 *
 * For an EXISTING single-tenant deployment:
 *   - Reads the singleton Organisation → creates a League with a generated slug.
 *   - For each Member → creates a LeagueMembership.
 *   - For each Member with an email → creates (or links) a UserAccount and
 *     attaches it to the LeagueMembership. Members without an email become
 *     LeagueMembership rows without a UserAccount; they appear in the
 *     leaderboard but cannot sign in until an admin attaches an email.
 *   - Ensures a SuperAdmin (env: BOOTSTRAP_SUPER_ADMIN_EMAIL).
 *   - Promotes one membership to League Admin (env: BOOTSTRAP_LEAGUE_ADMIN_EMAIL).
 *
 * For a FRESH deployment:
 *   - Creates the Platform row.
 *   - Bootstraps a SuperAdmin from env. No legacy data to migrate.
 *
 * Re-run safety: detects whether the migration has already produced its
 * primary artefact (a League with the generated slug) and skips the data
 * copy if so. The bootstrap idempotency layers on top of that.
 */

import { PrismaClient } from "@prisma/client";
import { logAuditEvent } from "../../../src/lib/audit/log";

const db = new PrismaClient();

const BOOTSTRAP_SUPER_ADMIN_EMAIL = (process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
const BOOTSTRAP_LEAGUE_ADMIN_EMAIL = (process.env.BOOTSTRAP_LEAGUE_ADMIN_EMAIL ?? "").trim().toLowerCase();

async function main(): Promise<void> {
  console.log("[seed] starting 002 multi-league migration");

  // 1. Platform singleton.
  const platformCount = await db.platform.count();
  if (platformCount === 0) {
    await db.platform.create({ data: {} });
    console.log("[seed] created Platform singleton");
  }

  // 2. Bootstrap SuperAdmin.
  await ensureSuperAdmin();

  // 3. Migrate legacy Organisation → League (only the first one; the legacy
  //    schema only ever had a singleton).
  const orgs = await db.organisation.findMany();
  if (orgs.length === 0) {
    console.log("[seed] no legacy Organisation found — fresh deployment, nothing to migrate");
    await db.$disconnect();
    return;
  }
  if (orgs.length > 1) {
    console.warn(`[seed] WARNING: legacy DB has ${orgs.length} Organisations; expected 1. Migrating each as a separate league.`);
  }

  for (const org of orgs) {
    await migrateOrg(org);
  }

  await db.$disconnect();
  console.log("[seed] done");
}

async function ensureSuperAdmin(): Promise<void> {
  if (!BOOTSTRAP_SUPER_ADMIN_EMAIL) {
    console.warn("[seed] BOOTSTRAP_SUPER_ADMIN_EMAIL not set — no Super Admin bootstrapped");
    return;
  }
  const account = await db.userAccount.upsert({
    where: { email: BOOTSTRAP_SUPER_ADMIN_EMAIL },
    update: {},
    create: { email: BOOTSTRAP_SUPER_ADMIN_EMAIL },
  });
  const existing = await db.superAdmin.findUnique({ where: { userAccountId: account.id } });
  if (!existing) {
    await db.superAdmin.create({ data: { userAccountId: account.id } });
    await logAuditEvent({
      actorKind: "migration",
      action: "super_admin.granted",
      targetKind: "super_admin",
      targetId: account.id,
      details: { email: BOOTSTRAP_SUPER_ADMIN_EMAIL, source: "bootstrap-env" },
    });
    console.log(`[seed] granted Super Admin to ${BOOTSTRAP_SUPER_ADMIN_EMAIL}`);
  } else if (existing.revokedAt) {
    await db.superAdmin.update({
      where: { id: existing.id },
      data: { revokedAt: null, revokedByUserAccountId: null },
    });
    console.log(`[seed] reinstated Super Admin for ${BOOTSTRAP_SUPER_ADMIN_EMAIL}`);
  }
}

async function migrateOrg(org: { id: string; name: string; miniLeagueId: number | null; digestPrompt: string | null; digestCacheGw: number | null; digestCacheJson: string | null }): Promise<void> {
  // Idempotency: was this org migrated before? `generateSlug` always picks a
  // free slug so we can't detect re-runs from slug collisions alone. Look up
  // the `migration.completed` AuditEvent whose details carry `legacyOrgId`.
  const completedEvents = await db.auditEvent.findMany({
    where: { action: "migration.completed" },
    select: { leagueId: true, details: true },
  });
  for (const evt of completedEvents) {
    if (!evt.details || !evt.leagueId) continue;
    try {
      const parsed = JSON.parse(evt.details) as { legacyOrgId?: string };
      if (parsed.legacyOrgId === org.id) {
        const existing = await db.league.findUnique({ where: { id: evt.leagueId } });
        if (existing) {
          console.log(`[seed] org ${org.id} already migrated to league "${existing.slug}" — refreshing admin promotion only`);
          await ensureLeagueAdminPromotion(existing.id);
          return;
        }
      }
    } catch {
      // Malformed details — fall through.
    }
  }

  const slug = await generateSlug(org.name);

  console.log(`[seed] migrating organisation "${org.name}" → league slug "${slug}"`);

  // Create the league.
  const league = await db.league.create({
    data: {
      slug,
      name: org.name,
      miniLeagueId: org.miniLeagueId,
      digestPrompt: org.digestPrompt,
      digestCacheGw: org.digestCacheGw,
      digestCacheJson: org.digestCacheJson,
    },
  });

  await logAuditEvent({
    leagueId: league.id,
    actorKind: "migration",
    action: "league.created",
    targetKind: "league",
    targetId: league.id,
    details: { name: league.name, slug: league.slug, source: "002-migration" },
  });

  // Migrate members.
  const members = await db.member.findMany({ where: { organisationId: org.id } });
  let withAccount = 0;
  let withoutAccount = 0;
  for (const m of members) {
    const email = m.email?.trim().toLowerCase() || null;
    let userAccountId: string | null = null;
    if (email) {
      const account = await db.userAccount.upsert({
        where: { email },
        update: m.displayName ? { displayName: m.displayName } : {},
        create: { email, displayName: m.displayName ?? null },
      });
      userAccountId = account.id;
      withAccount++;
    } else {
      withoutAccount++;
    }

    await db.leagueMembership.create({
      data: {
        leagueId: league.id,
        userAccountId,
        managerId: m.managerId,
        displayName: m.displayName ?? null,
        teamName: m.teamName ?? null,
        role: "member",
        source: m.source === "league" ? "league" : "manual",
        pointsDeductionPerGw: m.pointsDeductionPerGw,
        isActive: m.isActive,
        addedAt: m.addedAt,
      },
    });
  }
  console.log(`[seed] migrated ${members.length} members (${withAccount} with email/account, ${withoutAccount} without)`);

  // Carry over legacy User.lastLoginAt to UserAccount where possible.
  const legacyUsers = await db.user.findMany();
  for (const u of legacyUsers) {
    const member = members.find((m) => m.managerId === u.managerId);
    if (!member?.email) continue;
    await db.userAccount.update({
      where: { email: member.email.trim().toLowerCase() },
      data: { lastLoginAt: u.lastLoginAt },
    });
  }

  // Promote nominated league admin.
  await ensureLeagueAdminPromotion(league.id);

  await logAuditEvent({
    leagueId: league.id,
    actorKind: "migration",
    action: "migration.completed",
    targetKind: "league",
    targetId: league.id,
    details: {
      members: members.length,
      withAccount,
      withoutAccount,
      legacyOrgId: org.id,
    },
  });
}

async function ensureLeagueAdminPromotion(leagueId: string): Promise<void> {
  if (!BOOTSTRAP_LEAGUE_ADMIN_EMAIL) {
    // If no env var, ensure SOMEONE in this league has admin role; otherwise
    // promote the first active member with a UserAccount.
    const adminCount = await db.leagueMembership.count({
      where: { leagueId, role: "admin", isActive: true },
    });
    if (adminCount > 0) return;
    const candidate = await db.leagueMembership.findFirst({
      where: { leagueId, isActive: true, userAccountId: { not: null } },
      orderBy: { addedAt: "asc" },
    });
    if (!candidate) {
      throw new Error(
        `No League Admin can be assigned to league ${leagueId}: no active membership has a linked UserAccount. ` +
          `Set BOOTSTRAP_LEAGUE_ADMIN_EMAIL to an email that exists on a member, or add an email to a member first.`,
      );
    }
    await db.leagueMembership.update({
      where: { id: candidate.id },
      data: { role: "admin" },
    });
    console.log(`[seed] auto-promoted membership ${candidate.id} to admin (no BOOTSTRAP_LEAGUE_ADMIN_EMAIL set)`);
    await logAuditEvent({
      leagueId,
      actorKind: "migration",
      action: "membership.role_changed",
      targetKind: "membership",
      targetId: candidate.id,
      details: { from: "member", to: "admin", source: "auto-fallback" },
    });
    return;
  }

  // Find or create UserAccount for the bootstrap admin email; find their
  // membership in this league.
  const account = await db.userAccount.upsert({
    where: { email: BOOTSTRAP_LEAGUE_ADMIN_EMAIL },
    update: {},
    create: { email: BOOTSTRAP_LEAGUE_ADMIN_EMAIL },
  });
  const membership = await db.leagueMembership.findUnique({
    where: { leagueId_userAccountId: { leagueId, userAccountId: account.id } },
  });
  if (!membership) {
    console.warn(
      `[seed] BOOTSTRAP_LEAGUE_ADMIN_EMAIL=${BOOTSTRAP_LEAGUE_ADMIN_EMAIL} has no membership in league ${leagueId}; ` +
        `cannot promote. Falling back to auto-promotion.`,
    );
    // Recurse without the env to trigger the fallback.
    const wasSet = process.env.BOOTSTRAP_LEAGUE_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_LEAGUE_ADMIN_EMAIL;
    try {
      await ensureLeagueAdminPromotion(leagueId);
    } finally {
      if (wasSet !== undefined) process.env.BOOTSTRAP_LEAGUE_ADMIN_EMAIL = wasSet;
    }
    return;
  }
  if (membership.role !== "admin") {
    await db.leagueMembership.update({
      where: { id: membership.id },
      data: { role: "admin" },
    });
    console.log(`[seed] promoted ${BOOTSTRAP_LEAGUE_ADMIN_EMAIL} to League Admin in league ${leagueId}`);
    await logAuditEvent({
      leagueId,
      actorKind: "migration",
      action: "membership.role_changed",
      targetKind: "membership",
      targetId: membership.id,
      details: { from: "member", to: "admin", source: "BOOTSTRAP_LEAGUE_ADMIN_EMAIL" },
    });
  }
}

async function generateSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "league";

  // Resolve collisions by appending a numeric suffix.
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt}`;
    const existing = await db.league.findUnique({ where: { slug: candidate } });
    const historic = await db.leagueSlugHistory.findUnique({ where: { slug: candidate } });
    if (!existing && !historic) return candidate;
  }
  throw new Error(`Could not generate a unique slug for "${name}"`);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
