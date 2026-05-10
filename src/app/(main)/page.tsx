import { redirect } from "next/navigation";

/**
 * Root authenticated entry. Multi-league platform — there is no single global
 * dashboard. Send users to `/leagues`, which resolves to:
 *   - `/l/{slug}/standings` if the user has exactly one active membership
 *   - a chooser if they have several
 *   - the "no active leagues" page otherwise
 *
 * This replaces the legacy single-tenant landing (now at `/l/{leagueSlug}`).
 */
export default function HomePage() {
  redirect("/leagues");
}
