# Quickstart: UAT / Test Environment

**Feature**: 004-uat-deployment
**Audience**: The platform operator (today: tkawka@proxicon.io)
**Time to first deploy**: ~30 minutes one-off, ~10 minutes per subsequent deploy.

This document is the operator runbook. It assumes you have already shipped 002-multi-league-platform to production and have working `terraform apply`, `scripts/deploy.sh`, and SMTP set up.

---

## Once: stand UAT up

### 1. Provision the second EC2 instance

```bash
cd terraform
terraform plan     # confirms aws_instance.uat will be created
terraform apply
```

After apply succeeds:

```bash
terraform output uat_public_ip   # e.g., 3.214.7.91
```

This is your `<UAT-EIP>` from now on. Wait ~2 minutes for `user_data.sh` to finish bootstrapping (Node, PM2, Nginx).

### 2. Author `.env.uat`

```bash
cp .env.uat.example .env.uat
```

Edit `.env.uat`:

- `APP_URL=http://<UAT-EIP>/` (substitute the IP from step 1).
- `UAT_ALLOWED_EMAILS=` — at least one address. Suggest your own email plus any tester's.
- `BOOTSTRAP_SUPER_ADMIN_EMAIL=` — a **different** address from the production one. A `+uat` alias on the same inbox works (e.g., `tkawka+uat@proxicon.io`).
- `SESSION_SECRET=` — `openssl rand -base64 48` and paste.
- SMTP_* and `GROQ_API_KEY` — same values as `.env.production`.

Confirm `.gitignore` covers `.env.uat` (it should via the existing `.env*` rule; `git status` should not list it).

### 3. First deploy

```bash
bash scripts/uat/deploy.sh
```

The script will:
1. Validate `.env.uat` (refuses if `BOOTSTRAP_SUPER_ADMIN_EMAIL` or `SESSION_SECRET` matches prod's).
2. Build, upload, migrate, restart.
3. Run smoke tests (5 of them — see Acceptance test below).

If it exits 0, UAT is live at `http://<UAT-EIP>/`.

### 4. First sign-in

1. Visit `http://<UAT-EIP>/sign-in`.
2. The yellow "UAT environment — non-production data may be present" banner should be visible.
3. Enter the `BOOTSTRAP_SUPER_ADMIN_EMAIL` you set in step 2.
4. Check inbox; the magic-link email looks identical to production's, but the link points at `http://<UAT-EIP>/...`.
5. Click → land on UAT.

You are now Super Admin of an empty UAT instance.

---

## On every release: validate before promoting

```bash
# from the repo root, with the release branch checked out
bash scripts/uat/deploy.sh
```

Verify:
- Smoke tests passed (script exits 0).
- Banner visible on `http://<UAT-EIP>/sign-in`.
- Magic-link sign-in works for an allow-listed tester.
- The feature under test works.

Only then:

```bash
bash scripts/deploy.sh    # production deploy — same artefacts, different host
```

---

## On demand: refresh UAT with production data

When you need realistic data (large leagues, real audit history):

```bash
bash scripts/uat/refresh-from-prod.sh
```

Type `REFRESH` at the prompt. The script:
1. Snapshots current UAT db to `pre-refresh/`.
2. Copies prod.db to UAT.
3. Clears sessions and magic-link tokens (so production users cannot bypass the UAT allow-list).
4. Strips Super Admin from every account except the UAT `BOOTSTRAP_SUPER_ADMIN_EMAIL`.
5. Restarts PM2.

Verify:
- Sign in as the UAT bootstrap email (only allow-listed addresses can sign in regardless).
- Confirm the production Super Admin email is **not** Super Admin in UAT.

Important: UAT now contains real production member emails, names, and audit history. Do not screenshot UAT for external use without redacting; do not add new addresses to `UAT_ALLOWED_EMAILS` unless the tester is briefed.

---

## When something goes wrong

### Rollback a bad UAT deploy

```bash
bash scripts/uat/rollback.sh        # restores previous .next + previous uat.db
```

Or partial:

```bash
bash scripts/uat/rollback.sh --code     # keep the data, restore code
bash scripts/uat/rollback.sh --data     # keep the code, restore data
bash scripts/uat/rollback.sh --refresh  # undo the last refresh-from-prod
```

Production is unaffected by any of these.

### Add or remove a tester

Edit `.env.uat` locally, change `UAT_ALLOWED_EMAILS`, then:

```bash
bash scripts/uat/deploy.sh --skip-build
```

(`--skip-build` reuses the existing `.next/`; restart takes ~30 seconds.)

### Lock everyone out

Set `UAT_ALLOWED_EMAILS=""` is **not** allowed — the app refuses to start with an empty allow-list in UAT mode. To temporarily lock out testers, leave at least one safe address (e.g., your own) in `UAT_ALLOWED_EMAILS`, then add tester addresses back when ready.

### Tear UAT down to save costs

```bash
cd terraform
terraform apply -var enable_uat=false
```

Production is unaffected. Run `terraform apply` (default `enable_uat=true`) to bring UAT back; the data is gone, but a fresh `bash scripts/uat/refresh-from-prod.sh` rebuilds it.

---

## Acceptance test — verifying the operator workflow

Run this end-to-end before declaring 004 done.

| Step | Expected | Maps to |
|---|---|---|
| `terraform apply` | Creates `aws_instance.uat`, outputs `uat_public_ip`. | FR-001 |
| `bash scripts/uat/deploy.sh` from a clean tree | Exits 0 within 15 minutes. | SC-001 |
| `curl -I http://<UAT-EIP>/` | Returns `X-Robots-Tag: noindex, nofollow`. | FR-011 |
| `curl -s http://<UAT-EIP>/sign-in` \| grep "UAT environment" | One match. | FR-021, SC-005 |
| POST magic-link for a non-allow-listed email | `{"sent":true}` HTTP 200. | FR-010 |
| `sqlite3 uat.db "SELECT COUNT(*) FROM magic_link_tokens WHERE email = 'attacker@x.com'"` after step 5 | `0` (no token issued). | FR-009 |
| POST magic-link for an allow-listed email | `{"sent":true}` HTTP 200; one new token row. | FR-009 |
| Click the link in the resulting email | Lands at `http://<UAT-EIP>/...`, signs in, banner visible. | FR-004, FR-021 |
| `bash scripts/uat/refresh-from-prod.sh` | Exits 0 within 15 minutes; prints row counts; prints UAT bootstrap email as sole Super Admin. | FR-013, FR-015, FR-022 |
| After refresh: `sqlite3 uat.db "SELECT COUNT(*) FROM sessions"` | `0`. | FR-015 |
| After refresh: `sqlite3 uat.db "SELECT COUNT(*) FROM magic_link_tokens"` | `0`. | FR-015 |
| After refresh: `sqlite3 uat.db "SELECT email FROM user_accounts WHERE is_super_admin=1"` | One row: the UAT bootstrap email. | FR-022 |
| `bash scripts/uat/rollback.sh` after a deliberately broken deploy | Restores previous build + db; smoke test passes; production unaffected. | FR-017, FR-018, SC-004 |
| `sqlite3 prod.db "SELECT COUNT(*) FROM audit_events WHERE created_at > <test-start>"` on production | `0` new rows attributable to UAT activity. | SC-003 |

All thirteen rows green → feature is done.
