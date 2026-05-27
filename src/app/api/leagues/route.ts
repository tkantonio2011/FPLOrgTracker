/**
 * Signed-in "create another league" endpoint (feature 005-public-signup).
 *
 * Unlike the public POST /api/auth/signup, this path requires an existing
 * session — the user is already verified, so no magic-link round-trip. The
 * League + LeagueMembership (role=admin) + AuditEvent are created in one
 * transaction. The caller is redirected to the new league's admin shell.
 *
 * Contract: specs/005-public-signup/contracts/create-another-league.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseBody, z, leagueNameSchema } from "@/lib/validation";
import { verifyFplMiniLeague } from "@/lib/fpl/verify-mini-league";
import { slugify, resolveAvailableSlug } from "@/lib/signup/slug";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createLeagueSchema = z.object({
  leagueName: leagueNameSchema,
  miniLeagueId: z.number().int().positive().lt(100_000_000),
});

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireSession(req);
    const body = await parseBody(req, createLeagueSchema);
    const ip = clientIp(req);

    // FPL verification — same 3 s budget as the public signup form.
    const verifyResult = await verifyFplMiniLeague(body.miniLeagueId);
    if (verifyResult.kind === "no_such_league") {
      void logAuditEvent({
        actorUserAccountId: user.userAccount.id,
        action: "signup.rejected.fpl_api_no_such_league",
        targetKind: "user_account",
        targetId: user.userAccount.id,
        details: { submittedMiniLeagueId: body.miniLeagueId, source: "signed_in_form" },
        requestIp: ip,
      });
      return fail("No FPL mini-league with that ID exists. Please check the number.", 400);
    }

    // Fast-path uniqueness check. The transaction below re-checks for race safety.
    const conflicting = await db.league.findUnique({
      where: { miniLeagueId: body.miniLeagueId },
      select: { id: true },
    });
    if (conflicting) {
      void logAuditEvent({
        actorUserAccountId: user.userAccount.id,
        action: "signup.rejected.duplicate_mini_league_id",
        targetKind: "league",
        targetId: conflicting.id,
        details: { submittedMiniLeagueId: body.miniLeagueId, source: "signed_in_form" },
        requestIp: ip,
      });
      return fail(
        "This FPL mini-league is already tracked. If you should be its admin, contact support.",
        409,
      );
    }

    const created = await db.$transaction(async (tx) => {
      // Race-safe re-check.
      const raceConflict = await tx.league.findUnique({
        where: { miniLeagueId: body.miniLeagueId },
        select: { id: true },
      });
      if (raceConflict) throw new Error("race:mini_league");

      const slug = await resolveAvailableSlug(slugify(body.leagueName));
      const league = await tx.league.create({
        data: {
          slug,
          name: body.leagueName,
          miniLeagueId: body.miniLeagueId,
          miniLeagueUnverified: verifyResult.kind !== "verified",
          createdByUserAccountId: user.userAccount.id,
        },
      });
      await tx.leagueMembership.create({
        data: {
          leagueId: league.id,
          userAccountId: user.userAccount.id,
          managerId: 0, // placeholder; first FPL sync populates the real one
          role: "admin",
          source: "self_signup",
          addedByUserAccountId: user.userAccount.id,
        },
      });
      return { league, slug };
    });

    void logAuditEvent({
      leagueId: created.league.id,
      actorUserAccountId: user.userAccount.id,
      action: "league.created.self_signup",
      targetKind: "league",
      targetId: created.league.id,
      details: {
        source: "signed_in_form",
        miniLeagueId: body.miniLeagueId,
        fplVerified: verifyResult.kind === "verified",
      },
      requestIp: ip,
    });

    return ok(
      {
        leagueId: created.league.id,
        slug: created.slug,
        redirectTo: `/l/${created.slug}/admin/settings`,
      },
      { status: 201 },
    );
  } catch (err) {
    return failFromError(err);
  }
}
