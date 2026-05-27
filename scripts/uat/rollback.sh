#!/usr/bin/env bash
# UAT rollback. See specs/004-uat-deployment/contracts/deploy-cli.md §rollback.sh.
#
# Restores previous code (.next/standalone.previous) and/or previous database
# snapshot (/home/ec2-user/backups/uat/{previous,pre-refresh}/uat.db). Production
# is never touched.
#
# Usage:
#   bash scripts/uat/rollback.sh             # restore previous .next AND previous uat.db
#   bash scripts/uat/rollback.sh --code      # restore previous .next only
#   bash scripts/uat/rollback.sh --data      # restore previous uat.db only
#   bash scripts/uat/rollback.sh --refresh   # restore pre-refresh uat.db (undo last refresh)
set -eu
set -o pipefail 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TERRAFORM_DIR="$PROJECT_DIR/terraform"
# UAT uses the deploy-key.pem private key (fpl-tracker-deploy-key AWS key pair).
KEY_FILE="$TERRAFORM_DIR/deploy-key.pem"

MODE="both"
for arg in "$@"; do
  case "$arg" in
    --code) MODE="code" ;;
    --data) MODE="data" ;;
    --refresh) MODE="refresh" ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ── Resolve UAT host ─────────────────────────────────────────────────────────
UAT_HOST=$(cd "$TERRAFORM_DIR" && terraform output -raw uat_public_ip 2>/dev/null || true)
if [ -z "$UAT_HOST" ]; then
  echo "ERROR: Could not resolve uat_public_ip from Terraform." >&2
  exit 2
fi

if [[ "$KEY_FILE" == /mnt/* ]]; then
  TEMP_KEY=$(mktemp /tmp/fpl-rollback-key.XXXXXX)
  cp "$KEY_FILE" "$TEMP_KEY"
  chmod 600 "$TEMP_KEY"
  KEY_FILE="$TEMP_KEY"
  trap 'rm -f "$TEMP_KEY"' EXIT
fi
SSH="ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=15"

echo "==> Rolling back UAT (mode: $MODE)"

# ── Pre-flight: confirm the requested slot(s) exist on UAT ──────────────────
declare -a checks
case "$MODE" in
  both)
    checks=("/home/ec2-user/app/.next/standalone.previous" "/home/ec2-user/backups/uat/previous/uat.db")
    ;;
  code)
    checks=("/home/ec2-user/app/.next/standalone.previous")
    ;;
  data)
    checks=("/home/ec2-user/backups/uat/previous/uat.db")
    ;;
  refresh)
    checks=("/home/ec2-user/backups/uat/pre-refresh/uat.db")
    ;;
esac

for path in "${checks[@]}"; do
  if ! $SSH "ec2-user@$UAT_HOST" "[ -e '$path' ]"; then
    echo "ERROR: Required rollback slot missing on UAT: $path" >&2
    exit 1
  fi
done

# ── Apply rollback ──────────────────────────────────────────────────────────
$SSH "ec2-user@$UAT_HOST" "bash -se" << REMOTE
set -e
MODE="$MODE"
APP_DB=/home/ec2-user/app/prisma/uat.db
BACKUPS_DIR=/home/ec2-user/backups/uat
STANDALONE_DIR=/home/ec2-user/app/.next/standalone

restore_code() {
  if [ -d "\$STANDALONE_DIR.previous" ]; then
    if [ -d "\$STANDALONE_DIR" ]; then
      rm -rf "\$STANDALONE_DIR.rolling-back"
      mv -f "\$STANDALONE_DIR" "\$STANDALONE_DIR.rolling-back"
    fi
    mv -f "\$STANDALONE_DIR.previous" "\$STANDALONE_DIR"
    # Keep the displaced standalone as the new "previous" for a second rollback.
    if [ -d "\$STANDALONE_DIR.rolling-back" ]; then
      mv -f "\$STANDALONE_DIR.rolling-back" "\$STANDALONE_DIR.previous"
    fi
    echo "  Restored .next/standalone from .previous"
  fi
}

restore_data() {
  local source="\$1"
  cp -f "\$source" /home/ec2-user/app/prisma/uat.db.incoming
  mv -f /home/ec2-user/app/prisma/uat.db.incoming "\$APP_DB"
  chmod 644 "\$APP_DB"
  echo "  Restored uat.db from \$source"
}

case "\$MODE" in
  both)
    restore_code
    restore_data "\$BACKUPS_DIR/previous/uat.db"
    ;;
  code)
    restore_code
    ;;
  data)
    restore_data "\$BACKUPS_DIR/previous/uat.db"
    ;;
  refresh)
    restore_data "\$BACKUPS_DIR/pre-refresh/uat.db"
    ;;
esac

pm2 restart fpl-tracker-uat
REMOTE

# ── Smoke test ──────────────────────────────────────────────────────────────
echo ""
echo "==> Verifying rollback with smoke test..."
if ! bash "$SCRIPT_DIR/smoke-test.sh"; then
  echo "ERROR: smoke test failed after rollback — UAT is in an unhealthy state." >&2
  exit 4
fi

echo ""
echo "==> Rollback complete (mode: $MODE). UAT is healthy."
