#!/usr/bin/env bash
# Refresh UAT's database from a sanitised-free snapshot of production.
# See specs/004-uat-deployment/contracts/deploy-cli.md §refresh-from-prod.sh
# and specs/004-uat-deployment/spec.md §Clarifications Q2.
#
# WHAT THIS DOES (in order):
#   1. Confirm with operator (must type REFRESH).
#   2. Rotate current/ → pre-refresh/ on UAT (via scripts/uat/snapshot.sh).
#   3. SSH prod, run `sqlite3 .backup` → snapshot file on prod.
#   4. scp the snapshot to operator laptop, then to UAT.
#   5. Atomically replace uat.db with the new snapshot.
#   6. Apply scripts/uat/cleanup.sql (clears sessions, magic-link tokens, and
#      revokes Super Admin from every account except the UAT bootstrap email).
#   7. pm2 restart fpl-tracker-uat. The existing bootstrap mechanism in
#      src/lib/auth/bootstrap.ts re-grants Super Admin to the UAT bootstrap
#      account on first request.
#
# WHAT THIS DOES *NOT* DO:
#   - Sanitise member content (clarification Q2 — accepted trade-off).
#   - Touch the production database in write mode.
#   - Touch any production EC2/Terraform state.
#
# Idempotency (FR-016): two consecutive runs leave UAT in the same state as
# one run with a slightly newer production snapshot.
set -eu
set -o pipefail 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TERRAFORM_DIR="$PROJECT_DIR/terraform"
# Production and UAT use different AWS key pairs:
#   production: fpl-tracker-recovery-key  → terraform/recovery-key.pem
#   UAT:        fpl-tracker-deploy-key    → terraform/deploy-key.pem
PROD_KEY_FILE="$TERRAFORM_DIR/recovery-key.pem"
UAT_KEY_FILE="$TERRAFORM_DIR/deploy-key.pem"
UAT_ENV_FILE="$PROJECT_DIR/.env.uat"

if [ ! -f "$UAT_ENV_FILE" ]; then
  echo "ERROR: $UAT_ENV_FILE not found." >&2
  exit 1
fi

BOOTSTRAP_EMAIL=$(grep "^BOOTSTRAP_SUPER_ADMIN_EMAIL=" "$UAT_ENV_FILE" | head -1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d "'" | tr -d ' ')
if [ -z "$BOOTSTRAP_EMAIL" ]; then
  echo "ERROR: BOOTSTRAP_SUPER_ADMIN_EMAIL is empty in .env.uat." >&2
  exit 1
fi

# ── Confirm ─────────────────────────────────────────────────────────────────
echo ""
echo "About to refresh UAT with a copy of production data."
echo "  Source: production prod.db (read-only via sqlite3 .backup)"
echo "  Target: UAT uat.db (current → pre-refresh, then overwrite)"
echo "  Sessions, magic-link tokens, and non-bootstrap Super Admin grants will be cleared."
echo "  UAT will then hold a verbatim copy of production member data (per spec Q2)."
echo ""
echo "Type REFRESH (uppercase) to proceed, anything else to abort."
read -r CONFIRMATION
if [ "$CONFIRMATION" != "REFRESH" ]; then
  echo "Aborted."
  exit 0
fi

# ── Resolve both hosts ──────────────────────────────────────────────────────
read_output() {
  local key="$1"
  (cd "$TERRAFORM_DIR" && terraform output -raw "$key" 2>/dev/null) || true
}

PROD_HOST=$(read_output public_ip)
UAT_HOST=$(read_output uat_public_ip)

if [ -z "$PROD_HOST" ] || [ -z "$UAT_HOST" ]; then
  echo "ERROR: Could not resolve both prod (public_ip) and UAT (uat_public_ip) hosts." >&2
  exit 1
fi

# WSL key-permission fix for both keys.
if [[ "$PROD_KEY_FILE" == /mnt/* ]]; then
  TEMP_PROD_KEY=$(mktemp /tmp/fpl-refresh-prod-key.XXXXXX)
  cp "$PROD_KEY_FILE" "$TEMP_PROD_KEY"
  chmod 600 "$TEMP_PROD_KEY"
  PROD_KEY_FILE="$TEMP_PROD_KEY"
  trap 'rm -f "$TEMP_PROD_KEY"' EXIT
fi
if [[ "$UAT_KEY_FILE" == /mnt/* ]]; then
  TEMP_UAT_KEY=$(mktemp /tmp/fpl-refresh-uat-key.XXXXXX)
  cp "$UAT_KEY_FILE" "$TEMP_UAT_KEY"
  chmod 600 "$TEMP_UAT_KEY"
  UAT_KEY_FILE="$TEMP_UAT_KEY"
  trap 'rm -f "$TEMP_PROD_KEY" "$TEMP_UAT_KEY"' EXIT
fi

SSH_PROD="ssh -i $PROD_KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=15"
SSH_UAT="ssh  -i $UAT_KEY_FILE  -o StrictHostKeyChecking=no -o ConnectTimeout=15"
SCP_PROD="scp -i $PROD_KEY_FILE -o StrictHostKeyChecking=no"
SCP_UAT="scp  -i $UAT_KEY_FILE  -o StrictHostKeyChecking=no"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOCAL_SNAPSHOT="/tmp/uat-refresh-$TIMESTAMP.db"
PROD_SNAPSHOT_PATH="/tmp/prod-snapshot-$TIMESTAMP.db"
UAT_SNAPSHOT_PATH="/tmp/uat-incoming-$TIMESTAMP.db"

# ── Step 1: rotate current → pre-refresh on UAT ─────────────────────────────
bash "$SCRIPT_DIR/snapshot.sh" --pre-refresh

# ── Step 2: take a read-only snapshot of prod.db on the production host ─────
echo "==> Reading production database (read-only)..."
$SSH_PROD "ec2-user@$PROD_HOST" "sqlite3 /home/ec2-user/app/prisma/prod.db \".backup '$PROD_SNAPSHOT_PATH'\""
PROD_BYTES=$($SSH_PROD "ec2-user@$PROD_HOST" "stat -c %s '$PROD_SNAPSHOT_PATH'" 2>/dev/null || echo "?")
echo "  Prod snapshot: $PROD_SNAPSHOT_PATH ($PROD_BYTES bytes)"

# ── Step 3: scp prod → laptop → UAT ─────────────────────────────────────────
echo "==> Transferring snapshot prod → laptop → UAT..."
$SCP_PROD "ec2-user@$PROD_HOST:$PROD_SNAPSHOT_PATH" "$LOCAL_SNAPSHOT"
$SCP_UAT  "$LOCAL_SNAPSHOT" "ec2-user@$UAT_HOST:$UAT_SNAPSHOT_PATH"
# Clean up the production-side temp file. UAT-side is cleaned up below.
$SSH_PROD "ec2-user@$PROD_HOST" "rm -f '$PROD_SNAPSHOT_PATH'"
rm -f "$LOCAL_SNAPSHOT"

# ── Step 4: atomic move into place on UAT, then apply cleanup ───────────────
echo "==> Applying snapshot + cleanup on UAT..."
$SSH_UAT "ec2-user@$UAT_HOST" "bash -se" << REMOTE
set -e
APP_DB=/home/ec2-user/app/prisma/uat.db

# Atomic replacement: write into a temp file in the same dir, then mv -f.
mv -f '$UAT_SNAPSHOT_PATH' /home/ec2-user/app/prisma/uat.db.incoming
mv -f /home/ec2-user/app/prisma/uat.db.incoming "\$APP_DB"
chmod 644 "\$APP_DB"
REMOTE

# Push the cleanup SQL up to UAT (avoids embedding it in a heredoc).
$SCP_UAT "$SCRIPT_DIR/cleanup.sql" "ec2-user@$UAT_HOST:/tmp/uat-cleanup-$TIMESTAMP.sql"

echo "==> Running cleanup SQL..."
$SSH_UAT "ec2-user@$UAT_HOST" "sqlite3 /home/ec2-user/app/prisma/uat.db \\
  -cmd \".parameter set :bootstrap '$BOOTSTRAP_EMAIL'\" \\
  < /tmp/uat-cleanup-$TIMESTAMP.sql"
$SSH_UAT "ec2-user@$UAT_HOST" "rm -f /tmp/uat-cleanup-$TIMESTAMP.sql"

# ── Step 5: restart PM2 so bootstrap.ts re-grants UAT Super Admin ───────────
echo "==> Restarting UAT process..."
$SSH_UAT "ec2-user@$UAT_HOST" "pm2 restart fpl-tracker-uat"

# ── Step 6: report row counts ───────────────────────────────────────────────
echo ""
echo "==> Refresh complete."
echo ""
echo "Post-refresh row counts (UAT):"
$SSH_UAT "ec2-user@$UAT_HOST" "sqlite3 /home/ec2-user/app/prisma/uat.db <<'SQL'
SELECT 'sessions' AS table_name, COUNT(*) AS rows FROM sessions
UNION ALL SELECT 'magic_link_tokens', COUNT(*) FROM magic_link_tokens
UNION ALL SELECT 'super_admins', COUNT(*) FROM super_admins
UNION ALL SELECT 'leagues', COUNT(*) FROM leagues
UNION ALL SELECT 'user_accounts', COUNT(*) FROM user_accounts;
SQL"

echo ""
echo "Super admin emails after re-bootstrap (give the app ~5 s to handle the first request):"
$SSH_UAT "ec2-user@$UAT_HOST" "sleep 5 && sqlite3 /home/ec2-user/app/prisma/uat.db \"SELECT ua.email FROM super_admins sa JOIN user_accounts ua ON ua.id = sa.user_account_id WHERE sa.revoked_at IS NULL\""

echo ""
echo "Runbook reference: specs/004-uat-deployment/quickstart.md §\"On demand: refresh UAT\""
