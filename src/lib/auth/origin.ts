/**
 * Source of truth for the absolute URL prefix used in any user-facing link the
 * server emits (magic-link emails, invitation emails, in-app redirects that
 * need to be fully qualified, etc.).
 *
 * Prefer the explicit APP_URL env var (set per-environment in .env.uat,
 * .env.production, etc.) over `req.nextUrl.origin`. `nextUrl.origin` derives
 * from the Host header forwarded by the reverse proxy, and standalone Next.js
 * has been observed to fall back to its bind address (0.0.0.0:3000) when the
 * Host header is missing or mishandled — see incident 2026-05-22, where every
 * UAT magic-link arrived as `http://0.0.0.0:3000/...`.
 *
 * APP_URL is authoritative because:
 *   - it is set deliberately by the operator per environment,
 *   - it cannot be spoofed by a client crafting a Host header,
 *   - it produces the same value whether the request hit Nginx, hit Next.js
 *     directly, or originated from a server-side caller (e.g., background job).
 *
 * Falls back to `req.nextUrl.origin` for local dev where APP_URL is unset.
 */

import type { NextRequest } from "next/server";

export function appOrigin(req: NextRequest): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    // Strip trailing slash(es) so callers can `${origin}/path` cleanly.
    return configured.replace(/\/+$/, "");
  }
  return req.nextUrl.origin;
}
