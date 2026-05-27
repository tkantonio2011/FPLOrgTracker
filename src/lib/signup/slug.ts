/**
 * Shared slug allocation for League creation.
 *
 * Used by:
 *   - src/app/api/platform/leagues/route.ts (Super Admin creates a league)
 *   - src/app/api/auth/verify/route.ts        (public sign-up — magic-link click)
 *   - src/app/api/leagues/route.ts            (signed-in "create another league")
 *
 * `slugify` is deterministic and Unicode-tolerant. `resolveAvailableSlug` checks
 * both the current `leagues` table and the historical `league_slug_history`
 * table so renaming a league doesn't free its old slug for someone else to
 * claim. On collision it appends `-2`, `-3`, ... up to a 1000-attempt cap.
 */

import { db } from "@/lib/db";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function isSlugTaken(slug: string): Promise<boolean> {
  const [current, history] = await Promise.all([
    db.league.findUnique({ where: { slug }, select: { id: true } }),
    db.leagueSlugHistory.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  return Boolean(current || history);
}

export async function resolveAvailableSlug(base: string): Promise<string> {
  if (!base) base = "league";
  // Try the base first, then -2, -3, ... up to a reasonable cap.
  if (!(await isSlugTaken(base))) return base;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base.slice(0, 60 - String(suffix).length - 1)}-${suffix}`;
    if (!(await isSlugTaken(candidate))) return candidate;
  }
  throw new Error("Could not generate a unique slug after 1000 attempts");
}
