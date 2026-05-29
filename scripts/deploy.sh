#!/usr/bin/env bash
# Deploy the FPL Org Tracker to AWS EC2.
#
# Prerequisites:
#   - terraform apply has been run and deploy-key.pem exists in terraform/
#   - .env.production exists in the project root (copy from .env.production.example)
#
# Usage:
#   bash scripts/deploy.sh              # build then deploy
#   bash scripts/deploy.sh --skip-build # deploy pre-built .next/ (build from Windows first)
#
# WSL 1 users: run these from Windows PowerShell/cmd first, then --skip-build:
#   npx prisma generate
#   npm run build
#
# UAT target: when invoked via scripts/uat/deploy.sh, the following env vars
# override the production defaults so the same artefacts deploy to UAT:
#   DEPLOY_TARGET=uat               (changes version-bump and changelog stamping)
#   DEPLOY_HOST_OVERRIDE=<eip>      (skip terraform.tfstate lookup)
#   DEPLOY_ENV_FILE=<path>          (defaults to .env.production; UAT passes .env.uat)
#   DEPLOY_DB_PATH=<absolute path>  (defaults to /home/ec2-user/app/prisma/prod.db)
#   DEPLOY_PM2_NAME=<name>          (defaults to fpl-tracker)
# See scripts/uat/deploy.sh and specs/004-uat-deployment/contracts/deploy-cli.md.
set -eu
set -o pipefail 2>/dev/null || true

SKIP_BUILD=false
for arg in "$@"; do
  [ "$arg" = "--skip-build" ] && SKIP_BUILD=true
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TERRAFORM_DIR="$PROJECT_DIR/terraform"
EC2_USER="ec2-user"
APP_DIR="/home/ec2-user/app"

# UAT/production overrides — see header comment.
DEPLOY_TARGET="${DEPLOY_TARGET:-production}"
DEPLOY_HOST_OVERRIDE="${DEPLOY_HOST_OVERRIDE:-}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$PROJECT_DIR/.env.production}"
DEPLOY_DB_PATH="${DEPLOY_DB_PATH:-/home/ec2-user/app/prisma/prod.db}"
DEPLOY_PM2_NAME="${DEPLOY_PM2_NAME:-fpl-tracker}"
DEPLOY_KEY_OVERRIDE="${DEPLOY_KEY_OVERRIDE:-}"
KEY_FILE="${DEPLOY_KEY_OVERRIDE:-$TERRAFORM_DIR/recovery-key.pem}"

if [ "$DEPLOY_TARGET" != "production" ] && [ "$DEPLOY_TARGET" != "uat" ]; then
  echo "ERROR: DEPLOY_TARGET must be 'production' or 'uat' (got '$DEPLOY_TARGET')."
  exit 1
fi

# ── Resolve EC2 IP from Terraform state ──────────────────────────────────────
echo "==> Resolving EC2 host..."

STATE_FILE="$TERRAFORM_DIR/terraform.tfstate"
TF_OUTPUT_NAME="public_ip"
if [ "$DEPLOY_TARGET" = "uat" ]; then
  TF_OUTPUT_NAME="uat_public_ip"
fi

PYTHON=""
for cmd in python3 python py; do
  if command -v "$cmd" &>/dev/null; then PYTHON="$cmd"; break; fi
done

# Convert a bash path to whatever the local Python understands. On Git Bash,
# `python3` is the native Windows binary and cannot resolve /d/foo paths — it
# needs D:\foo. cygpath is bundled with Git Bash. WSL Python (and Linux Python)
# both accept /mnt/d/... and /d/... so the function is a no-op there.
native_path() {
  if command -v cygpath &>/dev/null; then
    cygpath -w "$1"
  else
    echo "$1"
  fi
}

# Convert /<letter>/path → /cygdrive/<letter>/path on Git Bash so cwRsync
# (Cygwin-based) understands drive letters. No-op on WSL / Linux.
cygdrive_path() {
  if command -v cygpath &>/dev/null && [[ "$1" =~ ^/[a-zA-Z]/ ]]; then
    echo "/cygdrive/${1:1}"
  else
    echo "$1"
  fi
}

# rsync wrapper: Git Bash + cwRsync needs cygdrive paths and MSYS path-
# conversion disabled (otherwise MSYS rewrites /tmp → C:\msys64\tmp,
# and the `:` is parsed as host:path by rsync).
do_rsync() {
  if command -v cygpath &>/dev/null; then
    local args=()
    for a in "$@"; do
      if [[ "$a" =~ ^/[a-zA-Z]/ ]]; then
        args+=("/cygdrive/${a:1}")
      else
        args+=("$a")
      fi
    done
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" rsync "${args[@]}"
  else
    rsync "$@"
  fi
}

EC2_HOST=""
if [ -n "$DEPLOY_HOST_OVERRIDE" ]; then
  EC2_HOST="$DEPLOY_HOST_OVERRIDE"
else
  # Use `terraform output -raw` directly. The Python-parses-tfstate optimisation
  # was fragile on Git Bash where /d/... paths don't resolve in native Windows
  # Python. terraform output works the same everywhere.
  EC2_HOST=$(cd "$TERRAFORM_DIR" && terraform output -raw "$TF_OUTPUT_NAME" 2>/dev/null || true)
fi

if [ -z "$EC2_HOST" ]; then
  echo "ERROR: Could not read $TF_OUTPUT_NAME from Terraform state."
  echo "       Run 'cd terraform && terraform apply' first."
  exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
  echo "ERROR: SSH key not found at $KEY_FILE"
  echo "       Run 'cd terraform && terraform apply' to generate it."
  exit 1
fi

# WSL mounts Windows NTFS with 0777 — SSH refuses such permissions.
# Copy key to Linux tmpfs with correct 0600.
if [[ "$KEY_FILE" == /mnt/* ]]; then
  TEMP_KEY=$(mktemp /tmp/fpl-deploy-key.XXXXXX)
  cp "$KEY_FILE" "$TEMP_KEY"
  chmod 600 "$TEMP_KEY"
  KEY_FILE="$TEMP_KEY"
  trap 'rm -f "$TEMP_KEY"' EXIT
fi

SSH="ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=15"
# rsync invokes ssh in a Cygwin context (cwRsync), which can't read /d/...
# paths. Use /cygdrive/d/... here so the spawned ssh can open the key file.
RSYNC_KEY_FILE="$(cygdrive_path "$KEY_FILE")"
RSYNC_SSH="ssh -i $RSYNC_KEY_FILE -o StrictHostKeyChecking=no"

echo "==> Deploying to $EC2_USER@$EC2_HOST"
echo ""

# ── 0. Server pre-flight ──────────────────────────────────────────────────────
echo "==> Checking server dependencies..."
$SSH "$EC2_USER@$EC2_HOST" "
  which rsync &>/dev/null || sudo dnf install -y rsync
  sudo chown -R ec2-user:ec2-user /usr/lib/node_modules/prisma 2>/dev/null || true
"

# ── 1. Bump version + stamp CHANGELOG (skipped when --skip-build) ─────────────
# When using --skip-build, the Windows release script already bumped the version
# and stamped the changelog before building. Just read the current version.
cd "$PROJECT_DIR"
TODAY=$(date +%Y-%m-%d)

PKG_PATH_NATIVE=$(native_path "$PROJECT_DIR/package.json")
CHANGELOG_PATH_NATIVE=$(native_path "$PROJECT_DIR/CHANGELOG.md")

if [ "$SKIP_BUILD" = true ]; then
  NEW_VERSION=$("$PYTHON" -c "import sys, json; print(json.load(sys.stdin)['version'])" < "$PROJECT_DIR/package.json")
  echo "==> Using pre-built version v$NEW_VERSION (--skip-build)"
  if [ ! -d "$PROJECT_DIR/.next/standalone" ]; then
    echo "ERROR: .next/standalone not found — run 'npm run release && npx prisma generate && npm run build' first."
    exit 1
  fi
elif [ "$DEPLOY_TARGET" = "uat" ]; then
  # UAT deploys do NOT bump version or stamp CHANGELOG — that would inflate
  # the version number each time we tested a release candidate. Build only.
  NEW_VERSION=$("$PYTHON" -c "import sys, json; print(json.load(sys.stdin)['version'])" < "$PROJECT_DIR/package.json")
  echo "==> Building Next.js app for UAT (v$NEW_VERSION, no version bump)..."
  npx prisma generate
  npm run build
else
  echo "==> Bumping version..."
  NEW_VERSION=$("$PYTHON" - "$PKG_PATH_NATIVE" << 'PYEOF'
import sys, json, re
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    pkg = json.load(f)
parts = pkg['version'].split('.')
parts[2] = str(int(parts[2]) + 1)
pkg['version'] = '.'.join(parts)
with open(path, 'r', encoding='utf-8') as f:
    raw = f.read()
raw = re.sub(r'("version"\s*:\s*")[^"]+(")', lambda m: m.group(1) + pkg['version'] + m.group(2), raw, count=1)
with open(path, 'w', encoding='utf-8') as f:
    f.write(raw)
print(pkg['version'])
PYEOF
  )
  echo "    Version: v$NEW_VERSION ($TODAY)"

  if grep -q "^## vNEXT" "$PROJECT_DIR/CHANGELOG.md"; then
    "$PYTHON" - "$CHANGELOG_PATH_NATIVE" "$NEW_VERSION" "$TODAY" << 'PYEOF'
import sys
path, version, today = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('## vNEXT', f'## v{version} — {today}', 1)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
PYEOF
    echo "    CHANGELOG.md stamped with v$NEW_VERSION"
  else
    echo "    WARN: No '## vNEXT' section found in CHANGELOG.md — add one before the next deploy."
  fi

  # ── 2. Build ────────────────────────────────────────────────────────────────
  echo "==> Building Next.js app..."
  npx prisma generate
  npm run build
fi

# ── 2b. Copy Prisma engine binaries into standalone output ───────────────────
# Next.js file tracer only includes the native (Windows) Prisma engine binary.
# The Linux binary (rhel-openssl-3.0.x) is present after "prisma generate" but
# excluded from the trace — copy it explicitly before uploading.
echo "==> Injecting Prisma engine into standalone output..."
PRISMA_SRC="$PROJECT_DIR/node_modules/.prisma/client"
PRISMA_DST="$PROJECT_DIR/.next/standalone/node_modules/.prisma/client"
if [ -d "$PRISMA_SRC" ]; then
  mkdir -p "$PRISMA_DST"
  cp -r "$PRISMA_SRC/." "$PRISMA_DST/"
else
  echo "  WARN: node_modules/.prisma/client not found — run 'npx prisma generate' first."
fi

# ── 3. Upload build artifacts ─────────────────────────────────────────────────
echo "==> Uploading to EC2..."

do_rsync -az --delete \
  --exclude=prisma/ \
  --exclude=.env.local \
  -e "$RSYNC_SSH" \
  "$PROJECT_DIR/.next/standalone/" "$EC2_USER@$EC2_HOST:$APP_DIR/"

do_rsync -az --delete \
  -e "$RSYNC_SSH" \
  "$PROJECT_DIR/.next/static/" "$EC2_USER@$EC2_HOST:$APP_DIR/.next/static/"

if [ -d "$PROJECT_DIR/public" ]; then
  do_rsync -az --delete \
    -e "$RSYNC_SSH" \
    "$PROJECT_DIR/public/" "$EC2_USER@$EC2_HOST:$APP_DIR/public/"
fi

do_rsync -az \
  -e "$RSYNC_SSH" \
  --exclude="*.db" --exclude="*.db-journal" --exclude="*.db-wal" \
  "$PROJECT_DIR/prisma/" "$EC2_USER@$EC2_HOST:$APP_DIR/prisma/"

# Fix permissions so Nginx can read static assets
$SSH "$EC2_USER@$EC2_HOST" "
  chmod o+x /home/ec2-user
  chmod -R o+rX /home/ec2-user/app
"

# ── 4. Upload env file ────────────────────────────────────────────────────────
ENV_FILE="$DEPLOY_ENV_FILE"
if [ -f "$ENV_FILE" ]; then
  echo "==> Uploading $(basename "$ENV_FILE")..."
  # Belt-and-braces production-safety guard: if the target is UAT, the env file
  # MUST declare APP_ENV=uat. Refuses to upload .env.production to a UAT host.
  if [ "$DEPLOY_TARGET" = "uat" ]; then
    if ! grep -q "^APP_ENV=uat$" "$ENV_FILE"; then
      echo "ERROR: $ENV_FILE does not contain APP_ENV=uat — refusing to upload to UAT host."
      exit 1
    fi
  fi
  scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
    "$ENV_FILE" "$EC2_USER@$EC2_HOST:$APP_DIR/.env.local"
else
  echo "  WARN: $ENV_FILE not found — keeping existing server env."
fi

# ── 4b. Delete any prebuilt static API responses ─────────────────────────────
# Next.js statically pre-renders GET route handlers that have no `request`
# parameter at build time and stores the result as *.body files.  These files
# are served verbatim on every request, completely bypassing the database.
# Deleting them forces Next.js to run the handler live on each request.
# The correct long-term fix is `export const dynamic = "force-dynamic"` in
# each route file, but this cleanup is a safety net for any route that still
# lacks that annotation.
echo "==> Removing stale prebuilt API route responses..."
$SSH "$EC2_USER@$EC2_HOST" "
  find $APP_DIR/.next/server/app/api -name '*.body' -o -name '*.meta' 2>/dev/null | while read f; do
    echo \"  Removed: \$f\"
    rm -f \"\$f\"
  done
"

# ── 5. Migrate and restart ────────────────────────────────────────────────────
echo "==> Running migrations and restarting..."

$SSH "$EC2_USER@$EC2_HOST" bash << REMOTE
  set -e
  cd $APP_DIR

  # Remove the dev .env that Next.js copies into the standalone output.
  # It contains DATABASE_URL="file:./dev.db" and must never be used in production.
  rm -f "$APP_DIR/.env"

  # Stop PM2 BEFORE running migrations. A running Node/Prisma process holds an
  # exclusive lock on the SQLite file, which makes `prisma migrate deploy` fail
  # with "database is locked". Safe to ignore if the process isn't running yet
  # (first deploy).
  pm2 delete $DEPLOY_PM2_NAME 2>/dev/null || true

  DATABASE_URL="file:$DEPLOY_DB_PATH" \
    prisma migrate deploy --schema="$APP_DIR/prisma/schema.prisma"

  # Write a pm2 ecosystem config that hard-codes DATABASE_URL and APP_ENV so
  # they are always set correctly in the Node.js process regardless of env-file
  # loading order. Next.js will load SESSION_SECRET / SMTP_* / BOOTSTRAP_* /
  # UAT_ALLOWED_EMAILS / etc. from .env.local at startup; the values below are
  # already in process.env so dotenv won't override them.
  cat > "$APP_DIR/ecosystem.config.js" << 'ECOEOF'
module.exports = {
  apps: [{
    name: 'PM2NAME_PLACEHOLDER',
    script: './server.js',
    cwd: 'APPDIR_PLACEHOLDER',
    out_file: '/home/ec2-user/logs/out.log',
    error_file: '/home/ec2-user/logs/error.log',
    env: {
      NODE_ENV: 'production',
      APP_ENV: 'APPENV_PLACEHOLDER',
      PORT: '3000',
      DATABASE_URL: 'file:DBPATH_PLACEHOLDER'
    }
  }]
};
ECOEOF

  # Substitute the real values (can't expand inside single-quoted heredoc)
  sed -i "s|APPDIR_PLACEHOLDER|$APP_DIR|g" "$APP_DIR/ecosystem.config.js"
  sed -i "s|PM2NAME_PLACEHOLDER|$DEPLOY_PM2_NAME|g" "$APP_DIR/ecosystem.config.js"
  sed -i "s|APPENV_PLACEHOLDER|$DEPLOY_TARGET|g" "$APP_DIR/ecosystem.config.js"
  sed -i "s|DBPATH_PLACEHOLDER|$DEPLOY_DB_PATH|g" "$APP_DIR/ecosystem.config.js"

  # PM2 was stopped above (before migrate). Start cleanly now so the new
  # ecosystem config + fresh env vars take effect.
  pm2 start "$APP_DIR/ecosystem.config.js"
  pm2 save
REMOTE

# ── 6. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "==> Deploy complete! (target: $DEPLOY_TARGET)"
echo "    URL: http://$EC2_HOST"
echo "    SSH: ssh -i terraform/recovery-key.pem ec2-user@$EC2_HOST"
echo "    Logs: ssh ... 'pm2 logs $DEPLOY_PM2_NAME'"
