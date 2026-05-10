/**
 * Issue an invitation. League Admins issue for their league; Super Admins
 * issue for any league. Unlike the inline `POST /api/leagues/{id}/members`
 * with `email`, this endpoint does NOT pre-create a LeagueMembership — the
 * membership is created at acceptance time. Use this when the inviter only
 * has the invitee's email (no managerId yet).
 *
 * Contract: specs/002-multi-league-platform/contracts/auth-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz/league-scope";
import { resolveLeague } from "@/lib/authz/league-resolver";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";
import {
  parseBody,
  z,
  emailSchema,
  roleSchema,
} from "@/lib/validation";
import { issueInvitationToken } from "@/lib/auth/magic-link";
import { sendInvitation } from "@/lib/auth/email";
import { NotAuthorisedError } from "@/lib/authz/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  leagueId: z.string().min(1),
  email: emailSchema,
  role: roleSchema,
  managerId: z.number().int().positive().optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireSession(req);
    const body = await parseBody(req, postSchema);

    // Authorise: Super Admin OR active League Admin of the target league.
    // We resolve via the resolver so suspended/non-visible leagues are filtered
    // before we expose any details, then enforce the admin role explicitly.
    const resolved = await resolveLeague(body.leagueId, user.userAccount.id, {
      isSuperAdmin: user.userAccount.isSuperAdmin,
      requireMembership: !user.userAccount.isSuperAdmin,
    });
    if (!user.userAccount.isSuperAdmin) {
      if (!resolved.membership || resolved.membership.role !== "admin") {
        throw new NotAuthorisedError("League Admin role required");
      }
    }

    // Reject if the email already has an active membership in this league.
    const existingMembership = await db.leagueMembership.findFirst({
      where: {
        leagueId: resolved.league.id,
        userAccount: { email: body.email },
        isActive: true,
      },
      select: { id: true },
    });
    if (existingMembership) return fail("This email already has an active membership", 409);

    // Reject if a pending invitation already exists for (leagueId, email).
    const pending = await db.invitation.findFirst({
      where: {
        leagueId: resolved.league.id,
        email: body.email,
        acceptedAt: null,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (pending) {
      return fail("A pending invitation already exists for this email", 409);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const invitation = await db.invitation.create({
      data: {
        leagueId: resolved.league.id,
        email: body.email,
        role: body.role,
        managerId: body.managerId ?? null,
        displayName: body.displayName ?? null,
        invitedByUserAccountId: user.userAccount.id,
      },
    });

    const token = await issueInvitationToken(invitation.id, body.email, ip);
    const link = `${req.nextUrl.origin}/invitations/${token.plaintext}`;
    await sendInvitation(body.email, resolved.league.name, link);

    await logAuditEvent({
      leagueId: resolved.league.id,
      actorUserAccountId: user.userAccount.id,
      action: "invitation.issued",
      targetKind: "invitation",
      targetId: invitation.id,
      details: { email: body.email, role: body.role, managerId: body.managerId ?? null },
      requestIp: ip,
    });

    return ok(
      { invitationId: invitation.id, expiresAt: token.expiresAt.toISOString() },
      { status: 201 },
    );
  } catch (err) {
    return failFromError(err);
  }
}
