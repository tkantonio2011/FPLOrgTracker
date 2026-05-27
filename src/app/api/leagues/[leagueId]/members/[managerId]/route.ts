/**
 * Single-membership update and delete.
 *
 * PATCH  — League Admin only. Updates displayName, isActive, deduction,
 *          role (with last-admin guard), or email (auto-links a UserAccount
 *          and issues a sign-in magic-link if the address is new).
 * DELETE — League Admin only. Hard-deletes the membership row; rejects if
 *          this would leave the league with no active admin. The underlying
 *          UserAccount is intentionally left intact.
 *
 * Contract: specs/002-multi-league-platform/contracts/league-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireLeagueAdmin } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";
import {
  parseBody,
  z,
  emailSchema,
  roleSchema,
} from "@/lib/validation";
import { issueSignInToken } from "@/lib/auth/magic-link";
import { sendMagicLink } from "@/lib/auth/email";
import { appOrigin } from "@/lib/auth/origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable().optional(),
    isActive: z.boolean().optional(),
    pointsDeductionPerGw: z.number().int().min(0).max(1000).optional(),
    role: roleSchema.optional(),
    email: emailSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty update" });

/**
 * URL identifies the membership by its FPL `managerId` within the league —
 * this matches the rest of `/api/leagues/[leagueId]/members/[managerId]/*`
 * (performance, squad, narrative). The (leagueId, managerId) pair is unique
 * in the schema.
 */
async function loadMembership(leagueId: string, managerIdRaw: string) {
  const managerId = Number(managerIdRaw);
  if (!Number.isFinite(managerId) || managerId <= 0) return null;
  return db.leagueMembership.findUnique({
    where: { leagueId_managerId: { leagueId, managerId } },
    include: { userAccount: { select: { id: true, email: true } } },
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { leagueId: string; managerId: string } },
) {
  try {
    const { league, user } = await requireLeagueAdmin(req, ctx.params.leagueId);
    const body = await parseBody(req, patchSchema);

    const membership = await loadMembership(league.id, ctx.params.managerId);
    if (!membership) return fail("Membership not found", 404);

    // Last-admin guard: demote or deactivate of the only admin → 409.
    const isDemote = body.role === "member" && membership.role === "admin";
    const isDeactivate = body.isActive === false && membership.isActive === true;
    if ((isDemote || isDeactivate) && membership.role === "admin") {
      const otherAdmins = await db.leagueMembership.count({
        where: {
          leagueId: league.id,
          role: "admin",
          isActive: true,
          NOT: { id: membership.id },
        },
      });
      if (otherAdmins === 0) {
        return fail("Cannot demote or deactivate the only admin", 409);
      }
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    let userAccountIdUpdate: string | null | undefined = undefined;
    let emailMagicLinkPlaintext: { plaintext: string; toEmail: string } | null = null;

    if (body.email !== undefined) {
      if (body.email === null) {
        // Detach the user account on this membership but leave the account row alone.
        userAccountIdUpdate = null;
      } else {
        // Find or create the UserAccount, then attach to the membership.
        let account = await db.userAccount.findUnique({ where: { email: body.email } });
        let accountIsNew = false;
        if (!account) {
          account = await db.userAccount.create({
            data: { email: body.email, displayName: body.displayName ?? membership.displayName ?? undefined },
          });
          accountIsNew = true;
        }
        userAccountIdUpdate = account.id;

        // If the account is brand new (created here), auto-issue a sign-in
        // magic-link so the member can claim their access immediately. We
        // don't issue for existing accounts — they already have a way in.
        if (accountIsNew) {
          const token = await issueSignInToken(body.email, account.id, ip);
          if (token) {
            emailMagicLinkPlaintext = { plaintext: token.plaintext, toEmail: body.email };
          }
        }
      }
    }

    const updates: Record<string, unknown> = {};
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.pointsDeductionPerGw !== undefined) updates.pointsDeductionPerGw = body.pointsDeductionPerGw;
    if (body.role !== undefined) updates.role = body.role;
    if (userAccountIdUpdate !== undefined) updates.userAccountId = userAccountIdUpdate;

    if (Object.keys(updates).length === 0) {
      return ok({ id: membership.id, unchanged: true });
    }

    await db.leagueMembership.update({ where: { id: membership.id }, data: updates });

    if (emailMagicLinkPlaintext) {
      const origin = appOrigin(req);
      const link = `${origin}/verify?token=${emailMagicLinkPlaintext.plaintext}`;
      await sendMagicLink(emailMagicLinkPlaintext.toEmail, link);
    }

    if (body.role !== undefined && body.role !== membership.role) {
      await logAuditEvent({
        leagueId: league.id,
        actorUserAccountId: user.userAccount.id,
        action: "membership.role_changed",
        targetKind: "membership",
        targetId: membership.id,
        details: { from: membership.role, to: body.role },
        requestIp: ip,
      });
    }
    if (body.isActive !== undefined && body.isActive !== membership.isActive) {
      await logAuditEvent({
        leagueId: league.id,
        actorUserAccountId: user.userAccount.id,
        action: body.isActive ? "membership.reactivated" : "membership.deactivated",
        targetKind: "membership",
        targetId: membership.id,
        requestIp: ip,
      });
    }

    const fresh = await loadMembership(league.id, String(membership.managerId));
    return ok({
      id: fresh!.id,
      managerId: fresh!.managerId,
      displayName: fresh!.displayName,
      teamName: fresh!.teamName,
      role: fresh!.role,
      source: fresh!.source,
      isActive: fresh!.isActive,
      pointsDeductionPerGw: fresh!.pointsDeductionPerGw,
      addedAt: fresh!.addedAt,
      hasUserAccount: fresh!.userAccountId !== null,
      email: fresh!.userAccount?.email ?? null,
    });
  } catch (err) {
    return failFromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: { leagueId: string; managerId: string } },
) {
  try {
    const { league, user } = await requireLeagueAdmin(req, ctx.params.leagueId);
    const membership = await loadMembership(league.id, ctx.params.managerId);
    if (!membership) return fail("Membership not found", 404);

    if (membership.role === "admin" && membership.isActive) {
      const otherAdmins = await db.leagueMembership.count({
        where: {
          leagueId: league.id,
          role: "admin",
          isActive: true,
          NOT: { id: membership.id },
        },
      });
      if (otherAdmins === 0) {
        return fail("Cannot remove the only admin", 409);
      }
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    await db.leagueMembership.delete({ where: { id: membership.id } });

    await logAuditEvent({
      leagueId: league.id,
      actorUserAccountId: user.userAccount.id,
      action: "membership.removed",
      targetKind: "membership",
      targetId: membership.id,
      details: {
        managerId: membership.managerId,
        role: membership.role,
        source: membership.source,
      },
      requestIp: ip,
    });

    return ok({ removed: true });
  } catch (err) {
    return failFromError(err);
  }
}
