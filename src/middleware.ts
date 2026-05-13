import { NextRequest, NextResponse } from "next/server";

/**
 * Page-level auth gate. Edge runtime — no Prisma access — so we only check for
 * the *presence* of a session cookie. Real validation happens in route handlers
 * and Server Component layouts via `requireSession` / `requireLeagueMember`.
 */

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "session";

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

/**
 * Legacy single-tenant URLs that have league-scoped equivalents under
 * `/l/[leagueSlug]/`. A signed-in user hitting one of these gets redirected
 * to `/leagues?next=<original-path>` — the league chooser then forwards them
 * to `/l/{their-slug}/<original-path>` (or shows the chooser if they have
 * multiple leagues).
 */
const LEGACY_REDIRECT_PATTERNS = [
  "/standings",
  "/agony",
  "/bench",
  "/captain-history",
  "/captain-whatif",
  "/differentials",
  "/form",
  "/h2h",
  "/live",
  "/luck",
  "/ownership",
  "/player-status",
  "/regret",
  "/season-stats",
  "/transfers",
  "/members",
  "/suggestions",
  "/wall-of-shame",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function isLegacyRedirect(pathname: string): boolean {
  return LEGACY_REDIRECT_PATTERNS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function hasSessionCookie(req: NextRequest): boolean {
  // We only check presence here; the value is verified server-side via DB.
  const v = req.cookies.get(SESSION_COOKIE)?.value;
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

  const signedIn = hasSessionCookie(req);

  // Redirect legacy single-tenant URLs to the league chooser, which forwards
  // the user into their league. We only do this when signed in — unsigned
  // users fall through to the sign-in redirect below, then come back here
  // after authenticating.
  if (signedIn && isLegacyRedirect(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/leagues";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn) return passthrough;

  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
