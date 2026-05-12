import { NextRequest, NextResponse } from "next/server";
import { parseUserTokenEdge, USER_COOKIE_NAME } from "@/lib/auth-edge";

/**
 * Page-level auth gate. Edge runtime — no Prisma access — so we only check for
 * the *presence* of a session cookie. Real validation happens in route handlers
 * and Server Component layouts via `requireSession` / `requireLeagueMember`.
 *
 * The new (multi-league) cookie is `session`. The legacy (single-tenant) cookie
 * is `user_session`. During the expand phase we accept either one so the legacy
 * routes keep working until they are fully migrated.
 */

const NEW_SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "session";

const PUBLIC_PREFIXES = [
  // Multi-league auth surface
  "/sign-in",
  "/verify",
  "/invitations",
  // API routes self-authenticate
  "/api/",
  // Framework / static
  "/_next",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

async function hasValidLegacyToken(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(USER_COOKIE_NAME)?.value;
  if (!token) return false;
  const managerId = await parseUserTokenEdge(token);
  return managerId !== null;
}

function hasNewSessionCookie(req: NextRequest): boolean {
  // We only check presence here; the value is verified server-side via DB.
  const v = req.cookies.get(NEW_SESSION_COOKIE)?.value;
  return Boolean(v && v.length > 0);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Surface the pathname to Server Component layouts via a request header.
  // App Router layouts don't get the URL directly; this is the official
  // workaround so layouts can build redirect targets.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const passthrough = NextResponse.next({ request: { headers: requestHeaders } });

  if (isPublic(pathname)) return passthrough;

  if (hasNewSessionCookie(req)) return passthrough;
  if (await hasValidLegacyToken(req)) return passthrough;

  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
