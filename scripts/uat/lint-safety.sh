#!/usr/bin/env bash
# Pre-merge guard for the scripts/uat/ production-safety contract.
# Greps every shell script in this directory for patterns that would violate
# the contract from contracts/deploy-cli.md §"Production safety contract".
#
# Exits 0 if all guards pass, 1 if any guard fails.
#
# What this enforces:
#   1. No script (other than refresh-from-prod.sh) connects to PROD_HOST.
#   2. No script runs `prisma migrate` against production paths.
#   3. No script references `aws_instance.app` or production-only Terraform names.
#   4. No script reads `.env.production` (only `.env.uat` may be used).
#   5. The deploy script asserts APP_ENV=uat on the env file being uploaded
#      (this lives in scripts/deploy.sh — guard checks the call site is present).
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
UAT_SCRIPTS_DIR="$SCRIPT_DIR"

FAIL=0
fail_line() { echo "  [FAIL] $1" >&2; FAIL=1; }
pass_line() { echo "  [PASS] $1"; }

# Helper: grep across non-comment, non-self lines of scripts/uat/*.sh.
#   - Excludes lines whose first non-whitespace char is `#` (shell comments).
#   - Excludes this script itself (we discuss the patterns here, can't match them).
#   - Optional second arg: filename pattern to additionally exclude.
grep_uat_scripts() {
  local pattern="$1"
  local extra_exclude="${2:-}"
  local out
  out=$(grep -nE "$pattern" "$UAT_SCRIPTS_DIR"/*.sh 2>/dev/null \
    | grep -v ':[[:space:]]*#' \
    | grep -v "lint-safety.sh:" \
    || true)
  if [ -n "$extra_exclude" ]; then
    out=$(echo "$out" | grep -v "$extra_exclude" || true)
  fi
  echo "$out"
}

# (1) Only refresh-from-prod.sh may SSH to production.
#     Detect by looking for the literal $PROD_HOST variable (used only in
#     refresh-from-prod.sh) or by reading the production-only Terraform output
#     `public_ip` (NOT `uat_public_ip`).
echo "==> Guard 1: production SSH access limited to refresh-from-prod.sh"
violations=$(grep_uat_scripts '(\$PROD_HOST|read_output[[:space:]]+public_ip\b|terraform[[:space:]]+output[[:space:]]+-raw[[:space:]]+public_ip\b)' 'refresh-from-prod.sh:')
if [ -n "$violations" ]; then
  fail_line "Production-host references found outside refresh-from-prod.sh:"
  echo "$violations" | sed 's/^/      /' >&2
else
  pass_line "Production SSH access is correctly scoped"
fi

# (2) No prisma migrate calls (the shared scripts/deploy.sh handles migrations
#     against the configured DEPLOY_DB_PATH only).
echo "==> Guard 2: no \`prisma migrate\` calls in scripts/uat/*.sh"
violations=$(grep_uat_scripts 'prisma[[:space:]]+migrate[[:space:]]+(deploy|reset|dev)')
if [ -n "$violations" ]; then
  fail_line "scripts/uat/*.sh must not run prisma migrate:"
  echo "$violations" | sed 's/^/      /' >&2
else
  pass_line "No prisma migrate calls in scripts/uat/*.sh"
fi

# (3) No references to aws_instance.app or production-only Terraform resources.
echo "==> Guard 3: no production Terraform resource names"
violations=$(grep_uat_scripts '(aws_instance\.app[^_]|aws_security_group\.app[^_]|aws_eip\.app[^_])')
if [ -n "$violations" ]; then
  fail_line "scripts/uat/*.sh references production-only Terraform resources:"
  echo "$violations" | sed 's/^/      /' >&2
else
  pass_line "No production Terraform resource references"
fi

# (4) Only scripts/uat/deploy.sh may read .env.production (and only as a
#     diff-check against .env.uat — never to upload to a server).
echo "==> Guard 4: only deploy.sh may read .env.production (for diff-check only)"
violations=$(grep_uat_scripts '\.env\.production' 'deploy.sh:')
if [ -n "$violations" ]; then
  fail_line "Unexpected .env.production reference:"
  echo "$violations" | sed 's/^/      /' >&2
else
  pass_line "No unauthorised .env.production reads"
fi

# (5) Shared deploy.sh asserts APP_ENV=uat on UAT uploads.
echo "==> Guard 5: scripts/deploy.sh asserts APP_ENV=uat when DEPLOY_TARGET=uat"
if grep -q 'APP_ENV=uat' "$PROJECT_DIR/scripts/deploy.sh"; then
  pass_line "scripts/deploy.sh contains the APP_ENV=uat guard"
else
  fail_line "scripts/deploy.sh missing the APP_ENV=uat guard required by the contract"
fi

echo ""
if [ "$FAIL" = "0" ]; then
  echo "==> Production-safety lint: ALL GUARDS PASSED"
  exit 0
else
  echo "==> Production-safety lint: ONE OR MORE GUARDS FAILED" >&2
  exit 1
fi
