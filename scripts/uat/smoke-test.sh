#!/usr/bin/env bash
# UAT smoke test — seven HTTP + DB checks confirming a UAT deploy is healthy.
# See specs/004-uat-deployment/contracts/deploy-cli.md §smoke-test.sh.
#
# Exit codes: 0 = all checks pass; 4 = at least one check failed.
set -eu
set -o pipefail 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TERRAFORM_DIR="$PROJECT_DIR/terraform"
# UAT uses the deploy-key.pem private key (fpl-tracker-deploy-key AWS key pair).
KEY_FILE="$TERRAFORM_DIR/deploy-key.pem"
UAT_ENV_FILE="$PROJECT_DIR/.env.uat"

# ── Resolve UAT host ─────────────────────────────────────────────────────────
# Honour UAT_HOST_OVERRIDE first (used when terraform CLI isn't on this shell's
# PATH, e.g. running smoke-test from WSL while Terraform is installed on
# Windows). Fall back to `terraform output -raw`.
UAT_HOST="${UAT_HOST_OVERRIDE:-}"
if [ -z "$UAT_HOST" ]; then
  UAT_HOST=$(cd "$TERRAFORM_DIR" && terraform output -raw uat_public_ip 2>/dev/null || true)
fi
if [ -z "$UAT_HOST" ]; then
  echo "[FAIL] Could not resolve uat_public_ip — set UAT_HOST_OVERRIDE=<ip> or run from a shell where 'terraform' is on PATH." >&2
  exit 4
fi

UAT_URL="http://$UAT_HOST"
echo "==> Smoke-testing $UAT_URL"

# WSL key-permission fix
if [[ "$KEY_FILE" == /mnt/* ]]; then
  TEMP_KEY=$(mktemp /tmp/fpl-smoke-key.XXXXXX)
  cp "$KEY_FILE" "$TEMP_KEY"
  chmod 600 "$TEMP_KEY"
  KEY_FILE="$TEMP_KEY"
  trap 'rm -f "$TEMP_KEY"' EXIT
fi
SSH="ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=15"

FAIL=0
PASS_LINE() { echo "  [PASS] $1"; }
FAIL_LINE() { echo "  [FAIL] $1"; FAIL=1; }

# ── Check 1: sign-in page returns 200 ───────────────────────────────────────
status=$(curl -s -o /tmp/uat-signin.html -w "%{http_code}" "$UAT_URL/sign-in" || echo "000")
if [ "$status" = "200" ]; then
  PASS_LINE "GET /sign-in returns 200"
else
  FAIL_LINE "GET /sign-in returns $status (expected 200)"
fi

# ── Check 2: sign-in page contains the UAT banner text ──────────────────────
if grep -q "UAT environment" /tmp/uat-signin.html 2>/dev/null; then
  PASS_LINE "/sign-in contains 'UAT environment' banner text"
else
  FAIL_LINE "/sign-in is missing the 'UAT environment' banner text"
fi

# ── Check 3: X-Robots-Tag header present ────────────────────────────────────
robots=$(curl -sI "$UAT_URL/sign-in" | grep -i "^x-robots-tag:" | tr -d '\r' || true)
if echo "$robots" | grep -qi "noindex"; then
  PASS_LINE "X-Robots-Tag: noindex header is set"
else
  FAIL_LINE "X-Robots-Tag header missing or does not contain 'noindex' (got: '$robots')"
fi

# ── Pick a non-allow-listed email and an allow-listed email ─────────────────
REJECTED_EMAIL="nobody-on-allowlist-$(date +%s)@invalid.test"
ALLOWED_EMAIL=""
if [ -f "$UAT_ENV_FILE" ]; then
  ALLOWED_EMAIL=$(grep "^UAT_ALLOWED_EMAILS=" "$UAT_ENV_FILE" | head -1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d "'" | cut -d',' -f1 | tr -d ' ')
fi

# Belt-and-braces guard against SQL/shell injection via a hand-edited .env.uat.
# We interpolate ALLOWED_EMAIL into a sqlite3 query below; refuse to proceed
# unless it matches a strict email shape (letters, digits, dot, underscore,
# plus, hyphen, '@'). The same shape was already enforced by allowlist.ts at
# runtime; this check protects the operator's local invocation as well.
if [ -n "$ALLOWED_EMAIL" ] && ! echo "$ALLOWED_EMAIL" | grep -qE '^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$'; then
  echo "[FAIL] First allow-listed email in .env.uat ('$ALLOWED_EMAIL') failed shape validation — refusing to proceed." >&2
  exit 4
fi

# ── Check 4: POST magic-link for non-allow-listed email → {"sent":true} ─────
resp=$(curl -s -o /tmp/uat-reject.json -w "%{http_code}" -X POST "$UAT_URL/api/auth/magic-link" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$REJECTED_EMAIL\"}" || echo "000")
if [ "$resp" = "200" ] && grep -q '"sent":true' /tmp/uat-reject.json 2>/dev/null; then
  PASS_LINE "POST magic-link rejected email returns {\"sent\":true}"
else
  FAIL_LINE "POST magic-link rejected email returned $resp / $(cat /tmp/uat-reject.json 2>/dev/null)"
fi

# ── Check 5: no token row was written for the rejected email ───────────────
count=$($SSH "ec2-user@$UAT_HOST" "sqlite3 /home/ec2-user/app/prisma/uat.db \"SELECT COUNT(*) FROM magic_link_tokens WHERE email='$REJECTED_EMAIL'\"" 2>/dev/null || echo "?")
if [ "$count" = "0" ]; then
  PASS_LINE "No token row written for rejected email"
else
  FAIL_LINE "Expected 0 rows in magic_link_tokens for rejected email, got $count"
fi

# ── Check 6: POST magic-link for allow-listed email → {"sent":true} ─────────
if [ -z "$ALLOWED_EMAIL" ]; then
  FAIL_LINE "Could not read first allow-listed email from .env.uat — skipping checks 6+7"
else
  resp=$(curl -s -o /tmp/uat-accept.json -w "%{http_code}" -X POST "$UAT_URL/api/auth/magic-link" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ALLOWED_EMAIL\"}" || echo "000")
  if [ "$resp" = "200" ] && grep -q '"sent":true' /tmp/uat-accept.json 2>/dev/null; then
    PASS_LINE "POST magic-link allow-listed email returns {\"sent\":true}"
  else
    FAIL_LINE "POST magic-link allow-listed email returned $resp / $(cat /tmp/uat-accept.json 2>/dev/null)"
  fi

  # ── Check 7: exactly one token row appears for the allow-listed email ────
  count=$($SSH "ec2-user@$UAT_HOST" "sqlite3 /home/ec2-user/app/prisma/uat.db \"SELECT COUNT(*) FROM magic_link_tokens WHERE email='$ALLOWED_EMAIL' AND used_at IS NULL\"" 2>/dev/null || echo "?")
  if [ "$count" = "1" ]; then
    PASS_LINE "Exactly one unused token row exists for allow-listed email"
  else
    FAIL_LINE "Expected 1 unused token row for allow-listed email, got $count"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
if [ "$FAIL" = "0" ]; then
  echo "==> Smoke test: ALL CHECKS PASSED"
  exit 0
else
  echo "==> Smoke test: ONE OR MORE CHECKS FAILED" >&2
  exit 4
fi
