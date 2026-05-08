import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { consumeToken } from "@/lib/auth/magic-link";
import { createSession, setSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeRedirect(origin: string, input: string | null): string {
  if (!input) return `${origin}/`;
  if (!input.startsWith("/")) return `${origin}/`;
  if (input.startsWith("//")) return `${origin}/`;
  return `${origin}${input}`;
}

function failRedirect(origin: string, reason: "invalid" | "expired" | "used"): NextResponse {
  const url = new URL("/verify", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const tokenParam = req.nextUrl.searchParams.get("token");
  const redirectParam = req.nextUrl.searchParams.get("redirect");
  if (!tokenParam) return failRedirect(origin, "invalid");

  const result = await consumeToken(tokenParam);
  if (!result.ok) return failRedirect(origin, result.reason);

  if (result.purpose === "invitation") {
    // Invitation tokens are accepted by a separate flow that captures any
    // missing fields (managerId, displayName) before creating the membership.
    // We redirect to the acceptance page; the page reads the invitation by id.
    const url = new URL(`/invitations/${result.invitationId}`, origin);
    return NextResponse.redirect(url, { status: 302 });
  }

  // Sign-in token consumed — create session.
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
