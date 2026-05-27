-- =============================================================================
-- 002 Multi-League Platform — Expand migration
-- =============================================================================
-- This migration is EXPAND-ONLY: the existing organisations / members / users
-- tables are left intact. The contract migration (drop legacy tables) lands
-- separately, after the seed script has copied data across.
--
-- For an EXISTING deployment:
--   1. Take a backup:  cp prisma/dev.db prisma/dev.db.pre-002
--   2. Apply this SQL (sqlite3 prisma/dev.db < migration.sql)  OR  use
--      `npx prisma migrate resolve --applied 002_multi_league` after baselining.
--   3. Run the seed:   npm run db:seed
--   4. Once Phase 3 route migration is complete and verified, apply the
--      contract migration that drops the legacy tables.
--
-- For a FRESH deployment:
--   The seed script will create a Platform row and bootstrap a SuperAdmin
--   from BOOTSTRAP_SUPER_ADMIN_EMAIL. There is no legacy data to migrate.
-- =============================================================================

-- Platform (singleton)
CREATE TABLE "platform" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT 'FPL Tracker',
  "default_logo_url" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- UserAccount
CREATE TABLE "user_accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "display_name" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_login_at" DATETIME,
  "disabled_at" DATETIME
);
CREATE UNIQUE INDEX "user_accounts_email_key" ON "user_accounts"("email");

-- League
CREATE TABLE "leagues" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "logo_url" TEXT,
  "mini_league_id" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'active',
  "digest_prompt" TEXT,
  "digest_cache_gw" INTEGER,
  "digest_cache_json" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_user_account_id" TEXT,
  "suspended_at" DATETIME,
  "suspended_by_user_account_id" TEXT,
  "suspension_reason" TEXT,
  CONSTRAINT "leagues_created_by_user_account_id_fkey"   FOREIGN KEY ("created_by_user_account_id")   REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "leagues_suspended_by_user_account_id_fkey" FOREIGN KEY ("suspended_by_user_account_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "leagues_slug_key"           ON "leagues"("slug");
CREATE UNIQUE INDEX "leagues_mini_league_id_key" ON "leagues"("mini_league_id");
CREATE INDEX        "leagues_status_idx"         ON "leagues"("status");

-- LeagueSlugHistory
CREATE TABLE "league_slug_history" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "league_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "replaced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "league_slug_history_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "league_slug_history_slug_key"   ON "league_slug_history"("slug");
CREATE INDEX        "league_slug_history_league_id_idx" ON "league_slug_history"("league_id");

-- LeagueMembership
CREATE TABLE "league_memberships" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "league_id" TEXT NOT NULL,
  "user_account_id" TEXT,
  "manager_id" INTEGER NOT NULL,
  "display_name" TEXT,
  "team_name" TEXT,
  "role" TEXT NOT NULL DEFAULT 'member',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "points_deduction_per_gw" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "added_by_user_account_id" TEXT,
  CONSTRAINT "league_memberships_league_id_fkey"                 FOREIGN KEY ("league_id")                 REFERENCES "leagues"("id")        ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "league_memberships_user_account_id_fkey"           FOREIGN KEY ("user_account_id")           REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "league_memberships_added_by_user_account_id_fkey"  FOREIGN KEY ("added_by_user_account_id")  REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "league_memberships_league_id_user_account_id_key" ON "league_memberships"("league_id", "user_account_id");
CREATE UNIQUE INDEX "league_memberships_league_id_manager_id_key"      ON "league_memberships"("league_id", "manager_id");
CREATE INDEX        "league_memberships_user_account_id_idx"           ON "league_memberships"("user_account_id");
CREATE INDEX        "league_memberships_league_id_is_active_idx"       ON "league_memberships"("league_id", "is_active");

-- SuperAdmin
CREATE TABLE "super_admins" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_account_id" TEXT NOT NULL,
  "granted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "granted_by_user_account_id" TEXT,
  "revoked_at" DATETIME,
  "revoked_by_user_account_id" TEXT,
  CONSTRAINT "super_admins_user_account_id_fkey"             FOREIGN KEY ("user_account_id")             REFERENCES "user_accounts"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "super_admins_granted_by_user_account_id_fkey"  FOREIGN KEY ("granted_by_user_account_id")  REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "super_admins_revoked_by_user_account_id_fkey"  FOREIGN KEY ("revoked_by_user_account_id")  REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "super_admins_user_account_id_key" ON "super_admins"("user_account_id");

-- Invitation
CREATE TABLE "invitations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "league_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "manager_id" INTEGER,
  "display_name" TEXT,
  "invited_by_user_account_id" TEXT NOT NULL,
  "accepted_at" DATETIME,
  "revoked_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_league_id_fkey"                 FOREIGN KEY ("league_id")                 REFERENCES "leagues"("id")        ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "invitations_invited_by_user_account_id_fkey" FOREIGN KEY ("invited_by_user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "invitations_league_id_accepted_at_idx" ON "invitations"("league_id", "accepted_at");
CREATE INDEX "invitations_email_idx"                 ON "invitations"("email");

-- MagicLinkToken
CREATE TABLE "magic_link_tokens" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token_hash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "user_account_id" TEXT,
  "email" TEXT NOT NULL,
  "invitation_id" TEXT,
  "expires_at" DATETIME NOT NULL,
  "used_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_from_ip" TEXT,
  CONSTRAINT "magic_link_tokens_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "magic_link_tokens_invitation_id_fkey"   FOREIGN KEY ("invitation_id")   REFERENCES "invitations"("id")   ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "magic_link_tokens_token_hash_key"     ON "magic_link_tokens"("token_hash");
CREATE UNIQUE INDEX "magic_link_tokens_invitation_id_key"  ON "magic_link_tokens"("invitation_id");
CREATE INDEX        "magic_link_tokens_email_purpose_idx"  ON "magic_link_tokens"("email", "purpose");
CREATE INDEX        "magic_link_tokens_expires_at_idx"     ON "magic_link_tokens"("expires_at");

-- Session
CREATE TABLE "sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token_hash" TEXT NOT NULL,
  "user_account_id" TEXT NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_agent" TEXT,
  "ip" TEXT,
  "revoked_at" DATETIME,
  CONSTRAINT "sessions_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sessions_token_hash_key"                  ON "sessions"("token_hash");
CREATE INDEX        "sessions_user_account_id_revoked_at_idx"  ON "sessions"("user_account_id", "revoked_at");

-- AuditEvent
CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "league_id" TEXT,
  "actor_user_account_id" TEXT,
  "actor_kind" TEXT NOT NULL DEFAULT 'user',
  "action" TEXT NOT NULL,
  "target_kind" TEXT NOT NULL,
  "target_id" TEXT,
  "details" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "request_ip" TEXT,
  CONSTRAINT "audit_events_league_id_fkey"             FOREIGN KEY ("league_id")             REFERENCES "leagues"("id")        ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "audit_events_actor_user_account_id_fkey" FOREIGN KEY ("actor_user_account_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_events_league_id_created_at_idx"             ON "audit_events"("league_id", "created_at");
CREATE INDEX "audit_events_created_at_idx"                       ON "audit_events"("created_at");
CREATE INDEX "audit_events_actor_user_account_id_created_at_idx" ON "audit_events"("actor_user_account_id", "created_at");
