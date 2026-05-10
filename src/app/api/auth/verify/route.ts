import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
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
