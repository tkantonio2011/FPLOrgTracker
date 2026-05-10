/**
 * Look up an invitation by plaintext token. The token IS the credential —
 * anyone holding it is authorised to view (but not modify) the invitation.
 * The token is NOT consumed by this endpoint; consumption happens on accept.
 *
 * Contract: specs/002-multi-league-platform/contracts/auth-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, failFromError } from "@/lib/http/response";
import { peekInvitationToken } from "@/lib/auth/magic-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: { token: string } }) {
  try {
    const peek = await peekInvitationToken(ctx.params.token);
    if (!peek.ok) {
      return fail("Invitation expired or already used", 410);
    }

    const invitation = await db.invitation.findUnique({
      where: { id: peek.invitationId },
      include: {
        league: { select: { id: true, name: true, logoUrl: true, status: true } },
        invitedByUserAccount: { select: { email: true } },
      },
    });
    if (!invitation) return fail("Invitation not found", 404);
    if (invitation.acceptedAt) return fail("Invitation already accepted", 410);
    if (invitation.revokedAt) return fail("Invitation revoked", 410);
    if (invitation.league.status === "suspended") {
      return fail("League is currently suspended", 410);
    }

    return ok({
      leagueId: invitation.league.id,
      leagueName: invitation.league.name,
      leagueLogoUrl: invitation.league.logoUrl,
      role: invitation.role === "admin" ? "admin" : "member",
      presuppliedManagerId: invitation.managerId,
      presuppliedDisplayName: invitation.displayName,
      inviterEmail: invitation.invitedByUserAccount.email,
      expiresAt: peek.expiresAt.toISOString(),
    });
  } catch (err) {
    return failFromError(err);
  }
}
