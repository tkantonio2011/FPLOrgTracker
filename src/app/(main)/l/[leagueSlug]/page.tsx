import { LandingPage } from "@/components/landing/LandingPage";

/**
 * League-scoped landing. Mirrors the legacy single-tenant `/` dashboard but
 * lives inside the `/l/{leagueSlug}` shell — `[leagueSlug]/layout.tsx` already
 * gates membership via `requireLeagueMemberFromCookie` and provides the league
 * context (Nav consumes `useLeague()` for the visible name + logo, see T039).
 *
 * The internal data fetches in `LandingPage` still hit the legacy unscoped
 * routes (`/api/auth/me`, `/api/org`, `/api/standings`, ...) and continue to
 * resolve to the migrated league via the legacy single-tenant lookup. A full
 * refactor of `LandingPage` to fetch from `/api/leagues/{league.id}/*` is a
 * follow-up task tracked alongside the contract migration.
 */
export default function LeagueHomePage() {
  return <LandingPage />;
}
