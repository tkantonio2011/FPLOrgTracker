/**
 * Platform-level leagues endpoint.
 *
 * GET  — list every league on the platform with member/admin/activity counts.
 * POST — create a new league and issue a magic-link invitation to the initial
 *        League Admin. The admin membership is NOT pre-created — it is created
 *        by the standard invitation accept flow when the admin clicks the link.
 *        This deviates from `platform-contracts.md` step 4 (which mandates a
 *        placeholder membership with `managerId: 0`) so we don't duplicate the
 *        accept-side membership creation logic. Until the admin accepts, the
 *        league sits at zero memberships — Super Admin can still manage it
 *        because requireLeagueAdmin bypasses for Super Admins.
 *
 * Contract: specs/002-multi-league-platform/contracts/platform-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authz/platform-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";
import {
  parseBody,
  parseQuery,
  z,
  emailSchema,
  leagueNameSchema,
  slugSchema,
} from "@/lib/validation";
import { issueInvitationToken } from "@/lib/auth/magic-link";
import { sendInvitation } from "@/lib/auth/email";
import { appOrigin } from "@/lib/auth/origin";
import { slugify, resolveAvailableSlug } from "@/lib/signup/slug";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── GET /api/platform/leagues ────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(["active", "suspended"]).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});

interface PlatformLeagueRow {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  memberCount: number;
  adminCount: number;
  miniLeagueId: number | null;
  createdAt: string;
  suspendedAt: string | null;
  lastActivityAt: string | null;
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const q = parseQuery(req, listQuerySchema);

    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search } },
        { slug: { contains: q.search } },
      ];
    }

    const [total, leagues] = await Promise.all([
      db.league.count({ where }),
      db.league.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);

    const leagueIds = leagues.map((l) => l.id);

    const [memberCounts, adminCounts, lastActivities] = await Promise.all([
      db.leagueMembership.groupBy({
        by: ["leagueId"],
        where: { leagueId: { in: leagueIds }, isActive: true },
        _count: { _all: true },
      }),
      db.leagueMembership.groupBy({
        by: ["leagueId"],
        where: { leagueId: { in: leagueIds }, isActive: true, role: "admin" },
        _count: { _all: true },
      }),
      // Last AuditEvent per league. SQLite has no DISTINCT ON, so issue one
      // query per league id — fine at v1 scale (≤50 leagues per page).
      Promise.all(
        leagueIds.map((leagueId) =>
          db.auditEvent
            .findFirst({
              where: { leagueId },
              orderBy: { createdAt: "desc" },
              select: { leagueId: true, createdAt: true },
            })
            .then((row) => row),
        ),
      ),
    ]);

    const memberCountBy = new Map(memberCounts.map((r) => [r.leagueId, r._count._all]));
    const adminCountBy = new Map(adminCounts.map((r) => [r.leagueId, r._count._all]));
    const lastActivityBy = new Map(
      lastActivities
        .filter((r): r is { leagueId: string; createdAt: Date } => r !== null && r.leagueId !== null)
        .map((r) => [r.leagueId, r.createdAt]),
    );

    const rows: PlatformLeagueRow[] = leagues.map((l) => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      status: l.status === "suspended" ? "suspended" : "active",
      memberCount: memberCountBy.get(l.id) ?? 0,
      adminCount: adminCountBy.get(l.id) ?? 0,
      miniLeagueId: l.miniLeagueId,
      createdAt: l.createdAt.toISOString(),
      suspendedAt: l.suspendedAt?.toISOString() ?? null,
      lastActivityAt: lastActivityBy.get(l.id)?.toISOString() ?? null,
    }));

    return ok(rows, { meta: { total, page: q.page, limit: q.limit } });
  } catch (err) {
    return failFromError(err);
  }
}

// ── POST /api/platform/leagues ───────────────────────────────────────────────

const postSchema = z.object({
  name: leagueNameSchema,
  slug: slugSchema.optional(),
  miniLeagueId: z.number().int().positive().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  initialAdminEmail: emailSchema,
  initialAdminManagerId: z.number().int().positive().optional(),
  initialAdminDisplayName: z.string().trim().min(1).max(80).optional(),
});

// Slug helpers (`slugify`, `resolveAvailableSlug`) moved to src/lib/signup/slug.ts
// in feature 005 so they're shared by Super Admin, public sign-up, and the
// signed-in "create another league" paths. Behaviour is unchanged.
//
// `isSlugTaken` is retained locally — only the operator-supplied-slug branch
// (line ~190) uses it directly; the new module exposes only the higher-level
// `resolveAvailableSlug`. Two lines is cheaper than widening the new module's
// public surface.
async function isSlugTaken(slug: string): Promise<boolean> {
  const [current, history] = await Promise.all([
    db.league.findUnique({ where: { slug }, select: { id: true } }),
    db.leagueSlugHistory.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  return Boolean(current || history);
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireSuperAdmin(req);
    const body = await parseBody(req, postSchema);

    // Resolve the slug. If the caller supplied one, reject on collision —
    // don't silently mutate their choice. If auto-generated, find an open one.
    let slug: string;
    if (body.slug) {
      if (await isSlugTaken(body.slug)) return fail("Slug already in use", 409);
      slug = body.slug;
    } else {
      slug = await resolveAvailableSlug(slugify(body.name));
    }

    // Reject miniLeagueId collisions with another league.
    if (body.miniLeagueId != null) {
      const owner = await db.league.findUnique({
        where: { miniLeagueId: body.miniLeagueId },
        select: { id: true },
      });
      if (owner) return fail("Mini-league ID already linked to another league", 409);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    // Create the League + UserAccount + Invitation in a single transaction so
    // we don't end up with an orphan league on a partial failure.
    const { league, invitation } = await db.$transaction(async (tx) => {
      const league = await tx.league.create({
        data: {
          slug,
          name: body.name,
          miniLeagueId: body.miniLeagueId ?? null,
          logoUrl: body.logoUrl ?? null,
          createdByUserAccountId: user.userAccount.id,
        },
      });

      const userAccount = await tx.userAccount.upsert({
        where: { email: body.initialAdminEmail },
        update: {},
        create: { email: body.initialAdminEmail },
      });

      const invitation = await tx.invitation.create({
        data: {
          leagueId: league.id,
          email: body.initialAdminEmail,
          role: "admin",
          managerId: body.initialAdminManagerId ?? null,
          displayName: body.initialAdminDisplayName ?? null,
          invitedByUserAccountId: user.userAccount.id,
        },
      });

      return { league, invitation, userAccount };
    });

    // Issue token + send email outside the transaction so a slow SMTP path
    // doesn't hold the DB connection.
    const token = await issueInvitationToken(invitation.id, body.initialAdminEmail, ip);
    const link = `${appOrigin(req)}/invitations/${token.plaintext}`;
    await sendInvitation(body.initialAdminEmail, league.name, link);

    // Audit trail. Fire-and-forget — each entry has its own try/catch internally.
    await logAuditEvent({
      leagueId: league.id,
      actorUserAccountId: user.userAccount.id,
      action: "league.created",
      targetKind: "league",
      targetId: league.id,
      details: {
        name: league.name,
        slug: league.slug,
        miniLeagueId: league.miniLeagueId,
        initialAdminEmail: body.initialAdminEmail,
      },
      requestIp: ip,
    });
    await logAuditEvent({
      leagueId: league.id,
      actorUserAccountId: user.userAccount.id,
      action: "invitation.issued",
      targetKind: "invitation",
      targetId: invitation.id,
      details: {
        email: body.initialAdminEmail,
        role: "admin",
        managerId: body.initialAdminManagerId ?? null,
        platformIssued: true,
      },
      requestIp: ip,
    });

    return ok(
      {
        leagueId: league.id,
        leagueSlug: league.slug,
        initialAdminInvitationId: invitation.id,
      },
      { status: 201 },
    );
  } catch (err) {
    return failFromError(err);
  }
}
