import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { consumeToken, consumeSelfSignupToken } from "@/lib/auth/magic-link";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { appOrigin } from "@/lib/auth/origin";
import { slugify, resolveAvailableSlug } from "@/lib/signup/slug";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeRedirect(origin: string, input: string | null): string {
  if (!input) return `${origin}/`;
  if (!input.startsWith("/")) return `${origin}/`;
  if (input.startsWith("//")) return `${origin}/`;
  return `${origin}${input}`;
}

function failRedirect(
  origin: string,
  // "conflict" is the self-signup case where another concurrent click won the
  // race for the same email or FPL mini-league ID. See research.md §R7.
  reason: "invalid" | "expired" | "used" | "conflict",
): NextResponse {
  const url = new URL("/verify", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const tokenParam = req.nextUrl.searchParams.get("token");
  const redirectParam = req.nextUrl.searchParams.get("redirect");
  if (!tokenParam) return failRedirect(origin, "invalid");

  // Peek without consuming so we can dispatch by purpose. Invitation tokens
  // must remain unconsumed so the acceptance page can submit any missing
  // fields (managerId/displayName) before the accept endpoint consumes them.
  const tokenHash = createHash("sha256").update(tokenParam).digest("hex");
  const peek = await db.magicLinkToken.findUnique({ where: { tokenHash } });
  if (!peek) return failRedirect(origin, "invalid");
  if (peek.usedAt) return failRedirect(origin, "used");
  if (peek.expiresAt.getTime() <= Date.now()) return failRedirect(origin, "expired");

  if (peek.purpose === "invitation") {
    // Pass the plaintext through so the acceptance page can resolve details
    // and the accept endpoint can consume it. The token stays single-use.
    return NextResponse.redirect(new URL(`/invitations/${tokenParam}`, origin), {
      status: 302,
    });
  }

  // Self-signup path (feature 005). Consume the token + create UserAccount,
  // League, LeagueMembership, AuditEvent in one transaction. The transaction
  // re-checks email and miniLeagueId uniqueness to handle the cross-token race
  // documented in research.md §R7 / spec FR-011b.
  if (peek.purpose === "self_signup") {
    const userAgent = req.headers.get("user-agent");
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip");

    const consumed = await consumeSelfSignupToken(tokenParam);
    if (!consumed.ok) {
      return failRedirect(origin, consumed.reason === "malformed" ? "invalid" : consumed.reason);
    }

    let newLeagueSlug: string;
    let newUserAccountId: string;
    let newLeagueId: string;
    try {
      const result = await db.$transaction(async (tx) => {
        // Race-safe re-check: another self-signup token may have claimed this
        // email or mini-league ID since the token was issued.
        const emailConflict = await tx.userAccount.findUnique({
          where: { email: consumed.email },
          select: { id: true },
        });
        if (emailConflict) throw new Error("conflict:email");

        const miniLeagueConflict = await tx.league.findUnique({
          where: { miniLeagueId: consumed.payload.miniLeagueId },
          select: { id: true },
        });
        if (miniLeagueConflict) throw new Error("conflict:mini_league");

        const slug = await resolveAvailableSlug(slugify(consumed.payload.leagueName));

        const userAccount = await tx.userAccount.create({
          data: { email: consumed.email, lastLoginAt: new Date() },
        });

        const league = await tx.league.create({
          data: {
            slug,
            name: consumed.payload.leagueName,
            miniLeagueId: consumed.payload.miniLeagueId,
            miniLeagueUnverified: consumed.payload.fplVerifiedAt === null,
            createdByUserAccountId: userAccount.id,
          },
        });

        await tx.leagueMembership.create({
          data: {
            leagueId: league.id,
            userAccountId: userAccount.id,
            managerId: 0, // placeholder until first FPL sync populates the real one
            role: "admin",
            source: "self_signup",
          },
        });

        return { userAccount, league, slug };
      });

      newUserAccountId = result.userAccount.id;
      newLeagueId = result.league.id;
      newLeagueSlug = result.slug;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "conflict:email" || message === "conflict:mini_league") {
        return failRedirect(origin, "conflict");
      }
      throw err;
    }

    // Audit AFTER commit so we never write a false-positive "league created".
    void logAuditEvent({
      leagueId: newLeagueId,
      actorUserAccountId: newUserAccountId,
      actorKind: "user",
      action: "league.created.self_signup",
      targetKind: "league",
      targetId: newLeagueId,
      details: {
        source: "magic_link",
        miniLeagueId: consumed.payload.miniLeagueId,
        fplVerified: consumed.payload.fplVerifiedAt !== null,
      },
      requestIp: ip,
    });

    const session = await createSession(newUserAccountId, { userAgent, ip });
    const res = NextResponse.redirect(
      new URL(`/l/${newLeagueSlug}/admin/settings`, origin),
      { status: 302 },
    );
    setSessionCookie(res, session.plaintextToken, session.expiresAt);
    return res;
  }

  // Sign-in path — consume the token and create a session.
  const result = await consumeToken(tokenParam);
  if (!result.ok) return failRedirect(origin, result.reason);
  if (result.purpose !== "sign_in") return failRedirect(origin, "invalid");

  await db.userAccount.update({
    where: { id: result.userAccountId },
    data: { lastLoginAt: new Date() },
  });

  const userAgent = req.headers.get("user-agent");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip");
  const session = await createSession(result.userAccountId, { userAgent, ip });

  const target = safeRedirect(origin, redirectParam);
  const res = NextResponse.redirect(target, { status: 302 });
  setSessionCookie(res, session.plaintextToken, session.expiresAt);
  return res;
}
