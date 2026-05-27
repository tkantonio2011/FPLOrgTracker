-- Feature 005-public-signup: additive schema migration.
-- See specs/005-public-signup/data-model.md for the design rationale.
--
-- (1) magic_link_tokens.self_signup_payload — JSON-encoded SelfSignupPayload
--     populated only when purpose='self_signup'. Carries the desired league
--     display name + FPL mini-league ID from form-submit time through to
--     magic-link-click time, when the UserAccount, League, LeagueMembership,
--     and audit event are created atomically in a single transaction.
--
-- (2) leagues.mini_league_unverified — set to 1 (true) when FPL API was
--     unreachable at sign-up time and the mini-league couldn't be verified.
--     The league settings page reads this flag and exposes a "Verify with
--     FPL" button until the league owner clears it by re-running the check.

ALTER TABLE "magic_link_tokens" ADD COLUMN "self_signup_payload" TEXT;

ALTER TABLE "leagues" ADD COLUMN "mini_league_unverified" INTEGER NOT NULL DEFAULT 0;
