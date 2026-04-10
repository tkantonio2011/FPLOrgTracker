import { NextRequest, NextResponse } from "next/server";
import { parseUserTokenEdge, USER_COOKIE_NAME } from "@/lib/auth-edge";

// Paths that do NOT require user authentication.
// All /api/* routes handle their own auth — middleware only protects pages.
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/admin",
  "/api/",
  "/_next",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token     = req.cookies.get(USER_COOKIE_NAME)?.value;
  const managerId = token ? await parseUserTokenEdge(token) : null;

  if (!managerId) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
