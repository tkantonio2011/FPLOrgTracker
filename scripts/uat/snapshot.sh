#!/usr/bin/env bash
# UAT-only snapshot management. See contracts/deploy-cli.md §snapshot.sh.
#
# Default behaviour: takes a snapshot of /home/ec2-user/app/prisma/uat.db on
# the UAT host using sqlite3 .backup (online-safe), and rotates the snapshot
# slots under /home/ec2-user/backups/uat/.
#
# Slots: current/  previous/  pre-refresh/
#   default rotation:   current → previous, then snapshot → current
#   --pre-refresh:      current → pre-refresh, then snapshot → current
#
# Used by deploy.sh (default rotation) and refresh-from-prod.sh (--pre-refresh).
set -eu
set -o pipefail 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TERRAFORM_DIR="$PROJECT_DIR/terraform"
# UAT uses the deploy-key.pem private key (fpl-tracker-deploy-key AWS key pair).
KEY_FILE="$TERRAFORM_DIR/deploy-key.pem"
ROTATE_SLOT="previous"

for arg in "$@"; do
  case "$arg" in
    --pre-refresh) ROTATE_SLOT="pre-refresh" ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ── Resolve UAT host ─────────────────────────────────────────────────────────
# Use `terraform output -raw` directly. It works cross-platform (Git Bash,
# WSL, native Linux). The earlier Python-parse-of-tfstate optimisation was
# fragile under Git Bash because /d/... paths don't resolve in native Python.
UAT_HOST=$(cd "$TERRAFORM_DIR" && terraform output -raw uat_public_ip 2>/dev/null || true)
if [ -z "$UAT_HOST" ]; then
  echo "ERROR: Could not resolve uat_public_ip from Terraform — has UAT been provisioned (terraform apply -var enable_uat=true)?" >&2
  exit 2
fi

# WSL key-permission fix
if [[ "$KEY_FILE" == /mnt/* ]]; then
  TEMP_KEY=$(mktemp /tmp/fpl-snapshot-key.XXXXXX)
  cp "$KEY_FILE" "$TEMP_KEY"
  chmod 600 "$TEMP_KEY"
  KEY_FILE="$TEMP_KEY"
  trap 'rm -f "$TEMP_KEY"' EXIT
fi
SSH="ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=15"

echo "==> Taking UAT snapshot (rotation slot: $ROTATE_SLOT)"

$SSH "ec2-user@$UAT_HOST" "bash -se" << REMOTE
set -e

BACKUPS_DIR=/home/ec2-user/backups/uat
APP_DB=/home/ec2-user/app/prisma/uat.db

mkdir -p "\$BACKUPS_DIR/current" "\$BACKUPS_DIR/previous" "\$BACKUPS_DIR/pre-refresh"

# (1) Rotate the existing current/ into the requested slot.
if [ -f "\$BACKUPS_DIR/current/uat.db" ]; then
  mv -f "\$BACKUPS_DIR/current/uat.db" "\$BACKUPS_DIR/$ROTATE_SLOT/uat.db"
  echo "  Rotated current/uat.db → $ROTATE_SLOT/uat.db"
fi

# (2) Take a fresh snapshot into current/.
if [ -f "\$APP_DB" ]; then
  sqlite3 "\$APP_DB" ".backup '\$BACKUPS_DIR/current/uat.db'"
  chmod 600 "\$BACKUPS_DIR/current/uat.db"
  echo "  New snapshot → current/uat.db ( \$(du -h "\$BACKUPS_DIR/current/uat.db" | cut -f1) )"
else
  echo "  WARN: \$APP_DB does not exist yet — no snapshot taken (first deploy?)"
fi
REMOTE

echo "==> Snapshot done."
