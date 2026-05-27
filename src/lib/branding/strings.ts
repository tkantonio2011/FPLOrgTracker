/**
 * Platform-generic strings.
 *
 * Hard rule: this file MUST NOT contain any reference to a specific industry,
 * company, or sector. Per-league identity (name, logo) lives on the League
 * record and is rendered through `useLeague().league.name` at runtime.
 *
 * The branding scan in tests/unit/branding/no-industry-references.test.ts
 * (Task T091) treats this file as the canonical source of platform copy.
 */

export const PLATFORM_NAME = "FPL Tracker";

export const DEFAULT_LEAGUE_NAME = "My League";

export const EMAIL_FROM_DISPLAY = "FPL Tracker";

export const MAGIC_LINK_SUBJECT = "Sign in to your FPL league";

export const INVITATION_SUBJECT = "You've been invited to a Fantasy Premier League league";

/**
 * Used in LLM prompts for narrative / horoscope / gw-report / trash-talk /
 * tribunal endpoints. The legacy single-tenant version baked the company name
 * directly into prompts; this helper takes the per-request league name.
 */
export function formatLeague(leagueName: string | null | undefined): string {
  const trimmed = (leagueName ?? "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_LEAGUE_NAME;
}

/**
 * Suspended-league copy. Members of a suspended league see this when the
 * route handler short-circuits on `requireLeagueMember`.
 */
export const LEAGUE_SUSPENDED_TITLE = "This league is suspended";
export const LEAGUE_SUSPENDED_BODY =
  "The platform administrator has temporarily suspended access to this league. Please reach out to your league admin if you think this is in error.";

/**
 * Generic UI strings replacing prior hard-coded org-specific labels.
 */
export const NAV_LEAGUE_LABEL = "League";
export const SIGN_IN_HEADING = "Sign in to your league";
export const SIGN_IN_SUBMIT_LABEL = "Email me a sign-in link";
export const SIGN_IN_SENT_MESSAGE =
  "If an account exists for that address, we've emailed a sign-in link. The link expires in 15 minutes.";
