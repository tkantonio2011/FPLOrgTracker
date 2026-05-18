/**
 * Route helper used by the LeagueSwitcher to preserve admin sub-paths when a
 * user with admin role on multiple leagues switches between them.
 *
 * Behaviour (full table — see specs/002-multi-league-platform/contracts/multi-admin-ux.md):
 *
 *   currentPath                          targetRole   →   returned href
 *   ─────────────────────────────────────────────────────────────────────────
 *   /l/<src>/admin                       admin            /l/<target>/admin
 *   /l/<src>/admin/settings              admin            /l/<target>/admin/settings
 *   /l/<src>/admin/members               admin            /l/<target>/admin/members
 *   /l/<src>/admin/digest                admin            /l/<target>/admin/digest
 *   /l/<src>/admin/audit                 admin            /l/<target>/admin/audit
 *   /l/<src>/admin/members/<id>(/…)      admin            /l/<target>/admin/members
 *                                                        (membership ids are not portable)
 *   /l/<src>/admin/<anything>            member           /l/<target>/standings
 *   /l/<src>/standings (or any other)    admin|member     /l/<target>/standings
 *   /my-admin                            admin|member     /l/<target>/standings
 *   any non-/l/ path                     admin|member     /l/<target>/standings
 *
 * Properties:
 * - Pure: no I/O, no React, no globals.
 * - Idempotent: mapAdminPath(mapAdminPath(p, s, r), s, r) === mapAdminPath(p, s, r).
 * - Drops query string and fragment; normalises trailing slashes on the input.
 */
export type LeagueRole = "admin" | "member";

const ADMIN_PATH_RE = /^\/l\/[^/]+\/admin(?:\/(.*))?$/;
const ADMIN_MEMBERS_ID_RE = /^members\/[^/]+/;

export function mapAdminPath(
  currentPath: string,
  targetLeagueSlug: string,
  targetRole: LeagueRole
): string {
  const fallback = `/l/${targetLeagueSlug}/standings`;

  if (typeof currentPath !== "string" || currentPath.length === 0) {
    return fallback;
  }

  // Strip query + hash; we only ever care about the pathname.
  const cleanedRaw = currentPath.split("?")[0].split("#")[0];
  const cleaned = cleanedRaw.length > 1 ? cleanedRaw.replace(/\/+$/, "") : cleanedRaw;

  // Admin sub-path is only preserved when the target user is themselves admin.
  if (targetRole !== "admin") return fallback;

  const match = cleaned.match(ADMIN_PATH_RE);
  if (!match) return fallback;

  const sub = match[1] ?? "";
  if (sub.length === 0) {
    return `/l/${targetLeagueSlug}/admin`;
  }

  // /admin/members/<id>(/…) → /admin/members (per-id segments aren't portable).
  if (ADMIN_MEMBERS_ID_RE.test(sub)) {
    return `/l/${targetLeagueSlug}/admin/members`;
  }

  return `/l/${targetLeagueSlug}/admin/${sub}`;
}
