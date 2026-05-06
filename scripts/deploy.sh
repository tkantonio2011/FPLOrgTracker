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
set -eu
set -o pipefail 2>/dev/null || true

SKIP_BUILD=false
for arg in "$@"; do
  [ "$arg" = "--skip-build" ] && SKIP_BUILD=true
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TERRAFORM_DIR="$PROJECT_DIR/terraform"
KEY_FILE="$TERRAFORM_DIR/recovery-key.pem"
EC2_USER="ec2-user"
APP_DIR="/home/ec2-user/app"

# ── Resolve EC2 IP from Terraform state ──────────────────────────────────────
echo "==> Resolving EC2 host..."

STATE_FILE="$TERRAFORM_DIR/terraform.tfstate"

PYTHON=""
for cmd in python3 python py; do
  if command -v "$cmd" &>/dev/null; then PYTHON="$cmd"; break; fi
done

EC2_HOST=""
if [ -f "$STATE_FILE" ] && [ -n "$PYTHON" ]; then
  EC2_HOST=$("$PYTHON" -c "
import json
with open('$STATE_FILE') as f:
    state = json.load(f)
print(state.get('outputs', {}).get('public_ip', {}).get('value', ''))
" 2>/dev/null)
fi

if [ -z "$EC2_HOST" ]; then
  EC2_HOST=$(cd "$TERRAFORM_DIR" && terraform output -raw public_ip 2>/dev/null) || true
fi

if [ -z "$EC2_HOST" ]; then
  echo "ERROR: Could not read public_ip from Terraform state."
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
RSYNC_SSH="ssh -i $KEY_FILE -o StrictHostKeyChecking=no"

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

if [ "$SKIP_BUILD" = true ]; then
  NEW_VERSION=$("$PYTHON" -c "import json; print(json.load(open('$PROJECT_DIR/package.json'))['version'])")
  echo "==> Using pre-built version v$NEW_VERSION (--skip-build)"
  if [ ! -d "$PROJECT_DIR/.next/standalone" ]; then
    echo "ERROR: .next/standalone not found — run 'npm run release && npx prisma generate && npm run build' first."
    exit 1
  fi
else
  echo "==> Bumping version..."
  NEW_VERSION=$("$PYTHON" - "$PROJECT_DIR/package.json" << 'PYEOF'
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
    "$PYTHON" - "$PROJECT_DIR/CHANGELOG.md" "$NEW_VERSION" "$TODAY" << 'PYEOF'
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

rsync -az --delete \
  --exclude=prisma/ \
  --exclude=.env.local \
  -e "$RSYNC_SSH" \
  "$PROJECT_DIR/.next/standalone/" "$EC2_USER@$EC2_HOST:$APP_DIR/"

rsync -az --delete \
  -e "$RSYNC_SSH" \
  "$PROJECT_DIR/.next/static/" "$EC2_USER@$EC2_HOST:$APP_DIR/.next/static/"

if [ -d "$PROJECT_DIR/public" ]; then
  rsync -az --delete \
    -e "$RSYNC_SSH" \
    "$PROJECT_DIR/public/" "$EC2_USER@$EC2_HOST:$APP_DIR/public/"
fi

rsync -az \
  -e "$RSYNC_SSH" \
  --exclude="*.db" --exclude="*.db-journal" --exclude="*.db-wal" \
  "$PROJECT_DIR/prisma/" "$EC2_USER@$EC2_HOST:$APP_DIR/prisma/"

# Fix permissions so Nginx can read static assets
$SSH "$EC2_USER@$EC2_HOST" "
  chmod o+x /home/ec2-user
  chmod -R o+rX /home/ec2-user/app
"

# ── 4. Upload env file ────────────────────────────────────────────────────────
ENV_FILE="$PROJECT_DIR/.env.production"
if [ -f "$ENV_FILE" ]; then
  echo "==> Uploading .env.production..."
  scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
    "$ENV_FILE" "$EC2_USER@$EC2_HOST:$APP_DIR/.env.local"
else
  echo "  WARN: .env.production not found — keeping existing server env."
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

  DATABASE_URL="file:$APP_DIR/prisma/prod.db" \
    prisma migrate deploy --schema="$APP_DIR/prisma/schema.prisma"

  # Write a pm2 ecosystem config that hard-codes DATABASE_URL so it is always
  # set correctly in the Node.js process regardless of env-file loading order.
  # Next.js will load ADMIN_PIN / SESSION_SECRET / etc. from .env.local at
  # startup; DATABASE_URL is already in process.env so dotenv won't override it.
  cat > "$APP_DIR/ecosystem.config.js" << 'ECOEOF'
module.exports = {
  apps: [{
    name: 'fpl-tracker',
    script: './server.js',
    cwd: 'APPDIR_PLACEHOLDER',
    out_file: '/home/ec2-user/logs/out.log',
    error_file: '/home/ec2-user/logs/error.log',
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL: 'file:APPDIR_PLACEHOLDER/prisma/prod.db'
    }
  }]
};
ECOEOF

  # Substitute the real app path (can't expand inside single-quoted heredoc)
  sed -i "s|APPDIR_PLACEHOLDER|$APP_DIR|g" "$APP_DIR/ecosystem.config.js"

  # Always delete and re-start so pm2's daemon has no stale env vars cached.
  pm2 delete fpl-tracker 2>/dev/null || true
  pm2 start "$APP_DIR/ecosystem.config.js"
  pm2 save
REMOTE

# ── 6. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "==> Deploy complete!"
echo "    URL: http://$EC2_HOST"
echo "    SSH: ssh -i terraform/recovery-key.pem ec2-user@$EC2_HOST"
echo "    Logs: ssh ... 'pm2 logs fpl-tracker'"
