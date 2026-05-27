#!/usr/bin/env bash
# Deploy the FPL Tracker to the UAT EC2 instance.
#
# Wraps scripts/deploy.sh with UAT-specific overrides. Same build artefacts,
# different host + different env file + different DB path + different PM2 name.
# See specs/004-uat-deployment/contracts/deploy-cli.md.
#
# Production-safety contract (every script under scripts/uat/):
#   1. Never SSH to production except in refresh-from-prod.sh (read-only).
#   2. Never run `prisma migrate` against production.
#   3. Never modify production Elastic IP, security group, or AMI.
#   4. Never read or upload .env.production.
#   5. Always assert APP_ENV=uat in the env file being uploaded.
#
# Usage:
#   bash scripts/uat/deploy.sh              # build + deploy + smoke test
#   bash scripts/uat/deploy.sh --skip-build # deploy a pre-built .next/standalone
set -eu
set -o pipefail 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
UAT_ENV_FILE="$PROJECT_DIR/.env.uat"
PROD_ENV_FILE="$PROJECT_DIR/.env.production"

# ── Pre-flight: validate .env.uat ────────────────────────────────────────────
if [ ! -f "$UAT_ENV_FILE" ]; then
  echo "ERROR: $UAT_ENV_FILE not found. Copy .env.uat.example and fill it in." >&2
  exit 1
fi

# Required-key checks
require_key() {
  local key="$1"
  if ! grep -q "^${key}=" "$UAT_ENV_FILE"; then
    echo "ERROR: .env.uat is missing $key=." >&2
    exit 1
  fi
  local value
  value=$(grep "^${key}=" "$UAT_ENV_FILE" | head -1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d "'")
  if [ -z "$value" ]; then
    echo "ERROR: .env.uat has empty $key=." >&2
    exit 1
  fi
}

require_key "APP_ENV"
require_key "APP_URL"
require_key "DATABASE_URL"
require_key "UAT_ALLOWED_EMAILS"
require_key "BOOTSTRAP_SUPER_ADMIN_EMAIL"
require_key "SESSION_SECRET"

# APP_ENV must literally be `uat`
if ! grep -q "^APP_ENV=uat$" "$UAT_ENV_FILE"; then
  echo "ERROR: .env.uat must contain APP_ENV=uat (got something else)." >&2
  exit 1
fi

# If .env.production exists locally, refuse if BOOTSTRAP_SUPER_ADMIN_EMAIL or
# SESSION_SECRET matches prod's. Pulls the value cleanly without sourcing the
# files (which could execute arbitrary shell metacharacters).
get_env_value() {
  local file="$1" key="$2"
  grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d "'"
}

if [ -f "$PROD_ENV_FILE" ]; then
  for key in BOOTSTRAP_SUPER_ADMIN_EMAIL SESSION_SECRET; do
    prod_val=$(get_env_value "$PROD_ENV_FILE" "$key")
    uat_val=$(get_env_value "$UAT_ENV_FILE" "$key")
    if [ -n "$prod_val" ] && [ "$prod_val" = "$uat_val" ]; then
      echo "ERROR: .env.uat $key matches .env.production. UAT must use a different value (FR-012)." >&2
      exit 1
    fi
  done
fi

# ── Pre-deploy rollback-slot rotation ────────────────────────────────────────
# Snapshot the current uat.db into the `previous/` slot, and move the existing
# standalone build into `.next/standalone.previous`. Both are restored by
# scripts/uat/rollback.sh when something goes wrong (FR-017, FR-019).
echo "==> Rotating rollback slots (db snapshot + .next/standalone.previous)..."
bash "$SCRIPT_DIR/snapshot.sh" || true

# The standalone rotation needs the UAT host; pull it from terraform here too.
# We accept best-effort: if the previous build isn't there yet (first deploy),
# this is a no-op.
TERRAFORM_DIR_INNER="$PROJECT_DIR/terraform"
UAT_HOST_INNER=$(cd "$TERRAFORM_DIR_INNER" && terraform output -raw uat_public_ip 2>/dev/null || true)
if [ -n "$UAT_HOST_INNER" ]; then
  KEY_FILE_INNER="$TERRAFORM_DIR_INNER/deploy-key.pem"
  if [[ "$KEY_FILE_INNER" == /mnt/* ]]; then
    TEMP_KEY_INNER=$(mktemp /tmp/fpl-rotate-key.XXXXXX)
    cp "$KEY_FILE_INNER" "$TEMP_KEY_INNER"
    chmod 600 "$TEMP_KEY_INNER"
    KEY_FILE_INNER="$TEMP_KEY_INNER"
    trap 'rm -f "$TEMP_KEY_INNER"' EXIT
  fi
  ssh -i "$KEY_FILE_INNER" -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
    "ec2-user@$UAT_HOST_INNER" "
      if [ -d /home/ec2-user/app/.next/standalone ]; then
        rm -rf /home/ec2-user/app/.next/standalone.previous 2>/dev/null || true
        cp -a /home/ec2-user/app/.next/standalone /home/ec2-user/app/.next/standalone.previous
        echo '  Snapshotted .next/standalone → .next/standalone.previous'
      else
        echo '  No existing .next/standalone (first deploy?) — skipping standalone rotation'
      fi
    " || echo "  WARN: standalone rotation skipped (host unreachable or first deploy)"
fi

# ── Hand off to the shared deploy script with UAT overrides ──────────────────
export DEPLOY_TARGET=uat
export DEPLOY_ENV_FILE="$UAT_ENV_FILE"
export DEPLOY_DB_PATH="/home/ec2-user/app/prisma/uat.db"
export DEPLOY_PM2_NAME="fpl-tracker-uat"
# UAT uses the `fpl-tracker-deploy-key` AWS key pair, whose private key on
# the operator laptop is `terraform/deploy-key.pem`. Production was launched
# with a different (older) key pair backed by `recovery-key.pem`.
export DEPLOY_KEY_OVERRIDE="$PROJECT_DIR/terraform/deploy-key.pem"

echo "==> UAT deploy: handing off to scripts/deploy.sh with UAT overrides"
bash "$PROJECT_DIR/scripts/deploy.sh" "$@"

# ── Post-deploy smoke test ───────────────────────────────────────────────────
echo ""
echo "==> Running UAT smoke test..."
# Propagate the host override so smoke-test.sh doesn't need terraform on PATH.
export UAT_HOST_OVERRIDE="${DEPLOY_HOST_OVERRIDE:-${UAT_HOST_INNER:-}}"
if ! bash "$SCRIPT_DIR/smoke-test.sh"; then
  echo "ERROR: smoke test failed — UAT deployed but is not healthy. See output above." >&2
  exit 4
fi

echo ""
echo "==> UAT deploy + smoke test OK."
