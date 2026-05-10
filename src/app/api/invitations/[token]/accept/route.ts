/**
 * Accept an invitation. Consumes the token, ensures a UserAccount exists for
 * the invitation email, creates the LeagueMembership, and signs the user in
 * by issuing a session cookie.
 *
 * Contract: specs/002-multi-league-platform/contracts/auth-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, failFromError } from "@/lib/http/response";
import { consumeToken } from "@/lib/auth/magic-link";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";
import { parseBody, z } from "@/lib/validation";
import { fetchEntry, FplApiError } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const acceptSchema = z.object({
  managerId: z.number().int().positive().optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export async function POST(req: NextRequest, ctx: { params: { token: string } }) {
  try {
    const body = await parseBody(req, acceptSchema);

    // Consume atomically — repeat calls fail with `used`.
    const result = await consumeToken(ctx.params.token);
    if (!result.ok) {
      const status = result.reason === "expired" || result.reason === "used" ? 410 : 400;
      return fail(`Invitation ${result.reason}`, status);
    }
    if (result.purpose !== "invitation") return fail("Token is not an invitation", 400);

    const invitation = await db.invitation.findUnique({
      where: { id: result.invitationId },
      include: { league: true },
    });
    if (!invitation) return fail("Invitation not found", 404);
    if (invitation.acceptedAt) return fail("Invitation already accepted", 410);
    if (invitation.revokedAt) return fail("Invitation revoked", 410);
    if (invitation.league.status === "suspended") {
      return fail("League is currently suspended", 410);
    }

    const finalManagerId = invitation.managerId ?? body.managerId;
    if (!finalManagerId) {
      return fail("Manager ID required to complete acceptance", 400);
    }
    const finalDisplayName = body.displayName ?? invitation.displayName ?? null;

    // Reject if the invitee's chosen managerId is already in the league.
    const dupe = await db.leagueMembership.findUnique({
      where: { leagueId_managerId: { leagueId: invitation.leagueId, managerId: finalManagerId } },
      select: { id: true },
    });
    if (dupe) return fail("This manager is already in the league", 409);

    // Fetch FPL profile for teamName + fallback display name.
    let teamName: string | null = null;
    let resolvedDisplayName: string | null = finalDisplayName;
    try {
      const entry = await fetchEntry(finalManagerId);
      teamName = entry.name ?? null;
      if (!resolvedDisplayName) {
        const full = `${entry.player_first_name ?? ""} ${entry.player_last_name ?? ""}`.trim();
        resolvedDisplayName = full || null;
      }
    } catch (err) {
      if (err instanceof FplApiError && (err.status === 404 || err.status === 403)) {
        return fail("Manager ID not found or profile is private", 422);
      }
      throw err;
    }

    // Ensure UserAccount, then create the membership and mark invitation accepted.
    const userAccount = await db.userAccount.upsert({
      where: { email: invitation.email },
      update: {
        // Don't clobber an existing displayName the user has chosen elsewhere.
        ...(resolvedDisplayName ? {} : {}),
      },
      create: {
        email: invitation.email,
        displayName: resolvedDisplayName ?? undefined,
      },
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const membership = await db.leagueMembership.create({
      data: {
        leagueId: invitation.leagueId,
        userAccountId: userAccount.id,
        managerId: finalManagerId,
        displayName: resolvedDisplayName,
        teamName,
        role: invitation.role === "admin" ? "admin" : "member",
        source: "invitation",
        isActive: true,
        addedByUserAccountId: invitation.invitedByUserAccountId,
      },
    });

    await db.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    await logAuditEvent({
      leagueId: invitation.leagueId,
      actorUserAccountId: userAccount.id,
      action: "invitation.accepted",
      targetKind: "invitation",
      targetId: invitation.id,
      requestIp: ip,
    });
    await logAuditEvent({
      leagueId: invitation.leagueId,
      actorUserAccountId: userAccount.id,
      action: "membership.added",
      targetKind: "membership",
      targetId: membership.id,
      details: { managerId: finalManagerId, source: "invitation" },
      requestIp: ip,
    });

    // Sign the new member in immediately so they land inside the league.
    const userAgent = req.headers.get("user-agent");
    const session = await createSession(userAccount.id, { userAgent, ip });

    const redirectTo = `/l/${invitation.league.slug}/standings`;
    const res = ok({ leagueSlug: invitation.league.slug, redirectTo });
    setSessionCookie(res, session.plaintextToken, session.expiresAt);
    return res;
  } catch (err) {
    return failFromError(err);
  }
}
