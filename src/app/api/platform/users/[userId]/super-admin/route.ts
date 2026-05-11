/**
 * Grant / revoke the Super Admin role on a user account.
 *
 * POST   — grant. Creates a SuperAdmin row (or clears revokedAt if a revoked
 *          one already exists for the user).
 * DELETE — revoke. Refuses if the requester is the target AND removing them
 *          would leave the platform with zero active Super Admins (lock-out
 *          protection; recovery is via BOOTSTRAP_SUPER_ADMIN_EMAIL on next
 *          boot, but we'd rather avoid the operator hitting that path).
 *
 * Contract: specs/002-multi-league-platform/contracts/platform-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authz/platform-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: { userId: string } }) {
  try {
    const { user } = await requireSuperAdmin(req);

    const target = await db.userAccount.findUnique({ where: { id: ctx.params.userId } });
    if (!target) return fail("User not found", 404);

    const existing = await db.superAdmin.findUnique({
      where: { userAccountId: target.id },
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    let row;
    if (existing) {
      if (!existing.revokedAt) {
        // Already active — return idempotent success without logging.
        return ok({ isSuperAdmin: true, alreadyGranted: true });
      }
      row = await db.superAdmin.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          revokedByUserAccountId: null,
          grantedAt: new Date(),
          grantedByUserAccountId: user.userAccount.id,
        },
      });
    } else {
      row = await db.superAdmin.create({
        data: {
          userAccountId: target.id,
          grantedByUserAccountId: user.userAccount.id,
        },
      });
    }

    await logAuditEvent({
      leagueId: null,
      actorUserAccountId: user.userAccount.id,
      action: "super_admin.granted",
      targetKind: "super_admin",
      targetId: row.id,
      details: { targetUserAccountId: target.id, targetEmail: target.email },
      requestIp: ip,
    });

    return ok({ isSuperAdmin: true });
  } catch (err) {
    return failFromError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: { userId: string } }) {
  try {
    const { user } = await requireSuperAdmin(req);

    const target = await db.userAccount.findUnique({ where: { id: ctx.params.userId } });
    if (!target) return fail("User not found", 404);

    const existing = await db.superAdmin.findUnique({
      where: { userAccountId: target.id },
    });
    if (!existing || existing.revokedAt) {
      // Already revoked — idempotent success without logging.
      return ok({ isSuperAdmin: false, alreadyRevoked: true });
    }

    // Lock-out guard: only refuses self-revoke when this would clear the
    // last active Super Admin. Another Super Admin revoking us is fine —
    // they retain access. Bootstrap env var remains as ultimate recovery.
    if (target.id === user.userAccount.id) {
      const otherActiveSupers = await db.superAdmin.count({
        where: {
          revokedAt: null,
          NOT: { id: existing.id },
        },
      });
      if (otherActiveSupers === 0) {
        return fail(
          "Cannot revoke your own Super Admin role — you are the only active Super Admin. Grant another user first, or use BOOTSTRAP_SUPER_ADMIN_EMAIL to recover.",
          409,
        );
      }
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const now = new Date();

    await db.superAdmin.update({
      where: { id: existing.id },
      data: { revokedAt: now, revokedByUserAccountId: user.userAccount.id },
    });

    await logAuditEvent({
      leagueId: null,
      actorUserAccountId: user.userAccount.id,
      action: "super_admin.revoked",
      targetKind: "super_admin",
      targetId: existing.id,
      details: { targetUserAccountId: target.id, targetEmail: target.email },
      requestIp: ip,
    });

    return ok({ isSuperAdmin: false });
  } catch (err) {
    return failFromError(err);
  }
}
