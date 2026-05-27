/**
 * League membership list and manual-add endpoint.
 *
 * GET  — visible to any league member (Super Admin bypasses). Email is
 *        included only when the requester is the League Admin or Super Admin.
 *        Default: only active memberships; pass `?includeInactive=1` to widen.
 *
 * POST — League Admin only. Adds a member by FPL Manager ID. The manager's
 *        team is fetched live from the FPL API to seed `teamName`. If `email`
 *        is provided, an Invitation is also issued and emailed.
 *
 * Contract: specs/002-multi-league-platform/contracts/league-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireLeagueAdmin, requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";
import {
  parseBody,
  parseQuery,
  z,
  emailSchema,
  paginationSchema,
} from "@/lib/validation";
import { fetchEntry, FplApiError } from "@/lib/fpl/client";
import { issueInvitationToken } from "@/lib/auth/magic-link";
import { sendInvitation } from "@/lib/auth/email";
import { appOrigin } from "@/lib/auth/origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listQuerySchema = paginationSchema
  .extend({
    includeInactive: z
      .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
      .optional(),
  })
  .transform((v) => ({
    page: v.page,
    limit: v.limit,
    includeInactive: v.includeInactive === "1" || v.includeInactive === "true",
  }));

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league, user } = await requireLeagueMember(req, ctx.params.leagueId);
    const isAdmin =
      user.userAccount.isSuperAdmin ||
      (await db.leagueMembership.findFirst({
        where: { leagueId: league.id, userAccountId: user.userAccount.id, role: "admin", isActive: true },
        select: { id: true },
      })) !== null;

    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    } catch {
      // Tolerate the legacy callers that don't pass page/limit/includeInactive.
      query = { page: 1, limit: 200, includeInactive: false };
    }

    const where = {
      leagueId: league.id,
      ...(query.includeInactive ? {} : { isActive: true }),
    };

    const [total, memberships] = await Promise.all([
      db.leagueMembership.count({ where }),
      db.leagueMembership.findMany({
        where,
        orderBy: { addedAt: "asc" },
        include: { userAccount: { select: { email: true } } },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    // Shape mirrors the legacy `members` payload: every consumer reads
    // managerId / displayName / teamName from each row. Email is admin-only.
    const members = memberships.map((m) => ({
      id: m.id,
      managerId: m.managerId,
      displayName: m.displayName,
      teamName: m.teamName,
      isActive: m.isActive,
      pointsDeductionPerGw: m.pointsDeductionPerGw,
      role: m.role,
      source: m.source,
      addedAt: m.addedAt,
      hasUserAccount: m.userAccountId !== null,
      ...(isAdmin ? { email: m.userAccount?.email ?? null } : {}),
    }));

    return ok(
      { members },
      { meta: { total, page: query.page, limit: query.limit } },
    );
  } catch (err) {
    return failFromError(err);
  }
}

const postSchema = z.object({
  managerId: z.number().int().positive(),
  displayName: z.string().trim().min(1).max(80).optional(),
  email: emailSchema.optional(),
});

export async function POST(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league, user } = await requireLeagueAdmin(req, ctx.params.leagueId);
    const body = await parseBody(req, postSchema);

    const existing = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: league.id, managerId: body.managerId } },
      select: { id: true },
    });
    if (existing) return fail("Manager already in this league", 409);

    let teamName: string | null = null;
    let derivedDisplayName: string | null = body.displayName ?? null;
    try {
      const entry = await fetchEntry(body.managerId);
      teamName = entry.name ?? null;
      if (!derivedDisplayName) {
        const first = entry.player_first_name ?? "";
        const last = entry.player_last_name ?? "";
        const full = `${first} ${last}`.trim();
        derivedDisplayName = full.length > 0 ? full : null;
      }
    } catch (err) {
      if (err instanceof FplApiError && (err.status === 404 || err.status === 403)) {
        return fail("Manager ID not found or profile is private", 422);
      }
      throw err;
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const membership = await db.leagueMembership.create({
      data: {
        leagueId: league.id,
        managerId: body.managerId,
        displayName: derivedDisplayName,
        teamName,
        role: "member",
        source: "manual",
        isActive: true,
        addedByUserAccountId: user.userAccount.id,
      },
    });

    await logAuditEvent({
      leagueId: league.id,
      actorUserAccountId: user.userAccount.id,
      action: "membership.added",
      targetKind: "membership",
      targetId: membership.id,
      details: { managerId: body.managerId, source: "manual" },
      requestIp: ip,
    });

    let invitationId: string | null = null;
    if (body.email) {
      // Block duplicate active invitations.
      const pending = await db.invitation.findFirst({
        where: { leagueId: league.id, email: body.email, acceptedAt: null, revokedAt: null },
        select: { id: true },
      });
      if (!pending) {
        const invitation = await db.invitation.create({
          data: {
            leagueId: league.id,
            email: body.email,
            role: "member",
            managerId: body.managerId,
            displayName: derivedDisplayName ?? undefined,
            invitedByUserAccountId: user.userAccount.id,
          },
        });
        invitationId = invitation.id;
        const token = await issueInvitationToken(invitation.id, body.email, ip);
        const origin = appOrigin(req);
        const link = `${origin}/invitations/${token.plaintext}`;
        await sendInvitation(body.email, league.name, link);
        await logAuditEvent({
          leagueId: league.id,
          actorUserAccountId: user.userAccount.id,
          action: "invitation.issued",
          targetKind: "invitation",
          targetId: invitation.id,
          details: { email: body.email, role: "member" },
          requestIp: ip,
        });
      }
    }

    return ok(
      {
        id: membership.id,
        managerId: membership.managerId,
        displayName: membership.displayName,
        teamName: membership.teamName,
        role: membership.role,
        source: membership.source,
        isActive: membership.isActive,
        pointsDeductionPerGw: membership.pointsDeductionPerGw,
        addedAt: membership.addedAt,
        hasUserAccount: membership.userAccountId !== null,
        email: body.email ?? null,
        invitationId,
      },
      { status: 201 },
    );
  } catch (err) {
    return failFromError(err);
  }
}
