-- SQL applied by scripts/uat/refresh-from-prod.sh AFTER replacing uat.db with
-- a copy of prod.db. The bootstrap email is passed via the .param mechanism
-- (sqlite3 -cmd ".parameter set :bootstrap '...'" then -f cleanup.sql).
--
-- See specs/004-uat-deployment/contracts/deploy-cli.md §refresh-from-prod.sh
-- and specs/004-uat-deployment/spec.md FR-015, FR-022.

-- (1) Clear all sessions copied from production. Without this, a production
--     user with a valid session cookie could navigate to the UAT URL and the
--     server would honour their session, bypassing the UAT allow-list (FR-015).
DELETE FROM sessions;

-- (2) Clear all magic-link tokens copied from production. Same reasoning:
--     a not-yet-clicked production magic-link would sign the user in to UAT.
DELETE FROM magic_link_tokens;

-- (2b) Clear all invitations copied from production. The matching invitation
--      tokens were already deleted in (2), but the Invitation rows themselves
--      remain and would collide with re-issued UAT invitations on the unique
--      (leagueId,email) pending constraint. They also still reference a
--      production League and would mis-route any UAT tester who re-uses a
--      copied production email.
DELETE FROM invitations;

-- (3) Revoke Super Admin from every account except the UAT bootstrap email.
--     The bootstrap mechanism in src/lib/auth/bootstrap.ts re-grants Super
--     Admin to BOOTSTRAP_SUPER_ADMIN_EMAIL on the next process start (FR-022).
--     We delete rather than set revoked_at = now() because bootstrap.ts will
--     re-create the row from scratch — leaving a stale revoked row would clog
--     audit trails for no operational benefit.
DELETE FROM super_admins
  WHERE user_account_id NOT IN (
    SELECT id FROM user_accounts WHERE LOWER(email) = LOWER(:bootstrap)
  );

-- Print row counts so the operator can sanity-check the cleanup.
SELECT 'sessions_remaining' AS metric, COUNT(*) AS value FROM sessions
UNION ALL SELECT 'magic_link_tokens_remaining', COUNT(*) FROM magic_link_tokens
UNION ALL SELECT 'super_admins_remaining', COUNT(*) FROM super_admins;
