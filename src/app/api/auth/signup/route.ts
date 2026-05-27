/**
 * Public sign-up endpoint.
 *
 * The public surface of feature 005-public-signup. Lets any visitor self-create
 * a UserAccount + League + LeagueMembership(role=admin) by submitting their
 * email, a desired league name, and an FPL mini-league ID.
 *
 * Two-step flow:
 *   1) POST /api/auth/signup (here) verifies the FPL mini-league ID, then
 *      issues a magic-link token of purpose="self_signup" carrying the desired
 *      league fields as a JSON payload. **No** UserAccount / League rows are
 *      written at this step.
 *   2) GET  /api/auth/verify?token=... (extended elsewhere) consumes the token
 *      and atomically creates the UserAccount, League, LeagueMembership, and
 *      audit event in one transaction. See specs/005-public-signup/research.md §R7.
 *
 * ENUMERATION-RESISTANCE CONTRACT (FR-013):
 *   The success-path response body and HTTP status MUST be byte-identical for
 *   every non-error path: new email, existing email, rate-limited, signed-in,
 *   FPL-inconclusive. The only differentiated responses are validation errors,
 *   FPL-404 (FR-021), and duplicate-mini-league-ID (FR-008) — both are user-
 *   visible correctness issues, not account-existence oracles.
 *
 * Contract: specs/005-public-signup/contracts/signup-endpoint.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseBody, z, leagueNameSchema } from "@/lib/validation";
import {
  checkSignInRateLimit,
  issueSignInToken,
  issueSelfSignupToken,
} from "@/lib/auth/magic-link";
import { sendMagicLink } from "@/lib/auth/email";
import { appOrigin } from "@/lib/auth/origin";
import { verifyFplMiniLeague } from "@/lib/fpl/verify-mini-league";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const signupBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
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
    const body = await parseBody(req, signupBodySchema);
    const ip = clientIp(req);

    // (1) Already signed in? Defence in depth — `/sign-up` page also handles
    //     this, but a direct API call from a signed-in browser must be a no-op.
    const session = await getSessionFromRequest(req);
    if (session) {
      return ok({ sent: true });
    }

    // (2) Rate limit — shares buckets with sign-in (research R5). Generic
    //     no-op response on bucket exhaustion so callers cannot probe limits.
    const rl = checkSignInRateLimit(body.email, ip);
    if (!rl.ok) {
      void logAuditEvent({
        action: "signup.rejected.rate_limited",
        targetKind: "user_account",
        targetId: null,
        actorKind: "system",
        details: { email: body.email, reason: rl.reason },
        requestIp: ip,
      });
      return ok({ sent: true });
    }

    // (3) Existing-email path. Issue a regular sign-in link instead of a
    //     self-signup token. Response is identical to the new-email branch so
    //     account existence is not enumerable.
    const existing = await db.userAccount.findUnique({ where: { email: body.email } });
    if (existing) {
      const isUsable = !existing.disabledAt;
      const signInIssued = await issueSignInToken(
        body.email,
        isUsable ? existing.id : null,
        ip,
      );
      if (signInIssued) {
        const link = `${appOrigin(req)}/api/auth/verify?token=${encodeURIComponent(
          signInIssued.plaintext,
        )}&redirect=${encodeURIComponent("/")}`;
        void sendMagicLink(body.email, link).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[signup] sign-in email send failed:", err);
        });
      }
      void logAuditEvent({
        action: "signup.rejected.duplicate_email",
        targetKind: "user_account",
        targetId: existing.id,
        actorKind: "system",
        details: { email: body.email, ip },
        requestIp: ip,
      });
      return ok({ sent: true });
    }

    // (4) FPL mini-league verification — 3 s budget, three branches.
    const verifyResult = await verifyFplMiniLeague(body.miniLeagueId);
    if (verifyResult.kind === "no_such_league") {
      void logAuditEvent({
        action: "signup.rejected.fpl_api_no_such_league",
        targetKind: "user_account",
        targetId: null,
        actorKind: "system",
        details: { submittedMiniLeagueId: body.miniLeagueId, email: body.email, ip },
        requestIp: ip,
      });
      return fail(
        "No FPL mini-league with that ID exists. Please check the number.",
        400,
      );
    }
    // verifyResult.kind === "verified" | "inconclusive" — continue.

    // (5) Fast-path duplicate-mini-league-ID check. Returns 409 with a clear
    //     message — the verify route does a race-safe re-check at click time.
    const conflictingLeague = await db.league.findUnique({
      where: { miniLeagueId: body.miniLeagueId },
      select: { id: true },
    });
    if (conflictingLeague) {
      void logAuditEvent({
        action: "signup.rejected.duplicate_mini_league_id",
        targetKind: "league",
        targetId: conflictingLeague.id,
        actorKind: "system",
        details: { submittedMiniLeagueId: body.miniLeagueId, ip },
        requestIp: ip,
      });
      return fail(
        "This FPL mini-league is already tracked. If you should be its admin, contact support.",
        409,
      );
    }

    // (6) Happy path. Issue the self-signup token + send the magic-link email.
    const payload = {
      leagueName: body.leagueName,
      miniLeagueId: body.miniLeagueId,
      fplVerifiedAt:
        verifyResult.kind === "verified" ? new Date().toISOString() : null,
    };
    const issued = await issueSelfSignupToken(body.email, payload, ip);
    const link = `${appOrigin(req)}/api/auth/verify?token=${encodeURIComponent(
      issued.plaintext,
    )}`;
    void sendMagicLink(body.email, link).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[signup] magic-link send failed:", err);
    });

    return ok({ sent: true });
  } catch (err) {
    return failFromError(err);
  }
}
