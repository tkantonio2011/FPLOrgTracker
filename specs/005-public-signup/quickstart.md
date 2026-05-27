# Quickstart: Public sign-up

**Feature**: 005-public-signup
**Audience**: Operator + first testers
**Prerequisite**: feature 005 is deployed (to UAT for testing, or to production for go-live).

---

## What this feature changes for end users

**Before**: New leagues could only be created by the platform Super Admin (`tkantonio76@gmail.com` on production) via `/platform/leagues/new`. New users could only join existing leagues via an invitation email.

**After**: Anyone on the open internet can visit `/sign-up`, fill in three fields (email, league name, FPL mini-league ID), receive a magic-link, click it, and immediately become admin of a brand-new league — no platform-owner action required.

---

## How to sign up as a new user

1. Visit `http://<host>/sign-in`.
2. Click the **"Don't have a league yet? Create one →"** link below the sign-in form.
3. On `/sign-up`, fill in:
   - **Email**: any address you control.
   - **League name**: whatever you want your league to be called.
   - **FPL mini-league ID**: the numeric ID from your league's URL on `fantasy.premierleague.com`.
4. Click **Create my league**.
5. Within 2 minutes, a magic-link arrives at the email. Click it.
6. You land at `/l/<your-slug>/admin/settings`, signed in as League Admin of your new league.

The first time you sign in, your league is empty of members. Use the existing **Invite member** flow to add others, or wait for the next FPL sync to pull in everyone from your mini-league.

---

## Edge-case behaviour the tester should verify

| Situation | Expected behaviour |
|---|---|
| You submit with a typo'd FPL mini-league ID (no league with that ID exists) | Inline form error: "No FPL mini-league with that ID exists. Please check the number." No email sent. |
| You submit with an FPL mini-league ID that already belongs to another league on the platform | Inline form error: "This FPL mini-league is already tracked. If you should be its admin, contact support." No email sent. |
| You submit with an email that already has a `UserAccount` on the platform | You receive a regular **sign-in** magic-link to your existing account. No new league is created. The form's confirmation message is the same generic "If your details match, you'll receive an email" — i.e. the form looks identical regardless of whether your email was new or existing. |
| You submit the form 6 times in a minute from the same IP | The 6th submission produces the same generic confirmation but no email is sent. (Per FR-012, rate-limited.) |
| You never click the magic-link | After 15 minutes the token expires. No `UserAccount`, no `League`, no slug reservation is left behind. You can submit the form again at any time. |
| You click the magic-link twice (or your inbox prefetches it) | The first click signs you in and creates your league. The second click lands on `/verify?error=used`. |
| FPL API is unreachable when you submit | The form still succeeds; your email arrives; your league is created with a "FPL verification pending" badge in its settings page. You can re-verify from there once FPL is back. |
| You sign in to an existing league, then create a second league | The "Create another league" button on `/leagues` (or `/my-admin`) opens a form that creates the new league synchronously — no magic-link needed because you're already authenticated. |

---

## How to sign up as a new user (UAT specifically)

Same as production, with one note: per the Q1 clarification in `spec.md`, UAT has **no email allow-list** for sign-up. Any email can register on UAT. This deliberately weakens the 004 UAT allow-list — every UAT tester or anyone who knows the UAT URL can self-signup. Treat UAT as functionally open.

---

## How the operator audits sign-ups

From the platform Super Admin's perspective, every sign-up — successful or rejected — leaves an audit trail.

### Daily audit-log review

1. Sign in as Super Admin.
2. Visit `/platform/audit`.
3. Filter by action prefix:
   - `league.created.self_signup` — successful new-league creations
   - `signup.rejected.duplicate_email` — someone tried to sign up with an existing email
   - `signup.rejected.duplicate_mini_league_id` — someone tried to claim a mini-league already on the platform
   - `signup.rejected.rate_limited` — someone hit a rate-limit bucket
   - `signup.rejected.fpl_api_no_such_league` — someone typed a bad FPL ID (or FPL was down and our verifier said 404)

### Suspending an abusive sign-up

1. Find the offending league in `/platform/leagues` (sortable by created-at).
2. Click **Suspend** — the existing 002 suspend flow disables the league for all members.
3. If the user account itself is abusive: `/platform/users` → find their email → **Disable**.
4. Both actions are audit-logged with the Super Admin as the actor.

The feature deliberately introduces **no new admin UI** — every abuse-response action uses existing platform surfaces.

---

## Acceptance test (run before declaring 005 shipped)

Run end-to-end on UAT before promoting to production.

| # | Step | Expected | Spec ref |
|---|---|---|---|
| 1 | Visit `/sign-in`. | "Don't have a league yet? Create one →" link is visible. | FR-018 |
| 2 | Click the link. | Lands at `/sign-up`. Form has email, league name, mini-league ID fields. | FR-001 / FR-002 |
| 3 | Submit with a brand-new email + valid FPL mini-league ID. | Generic confirmation message displayed. Magic-link email arrives ≤ 2 min. | FR-003 / SC-001 |
| 4 | Click the magic-link in the email. | Lands at `/l/<new-slug>/admin/settings`. Banner says "UAT" (if UAT). | FR-004 |
| 5 | Open `/leagues`. | New league appears in the list with an "Admin" chip. | US1 acceptance |
| 6 | As Super Admin, open `/platform/leagues`. | New league appears in the list; the new user's email is shown as initial admin. | US1 acceptance |
| 7 | As Super Admin, open `/platform/audit`. | One `league.created.self_signup` event with the new league as target. | FR-014 |
| 8 | From the new user's session, click "Create another league" on `/leagues`. Fill in a different name + different mini-league ID. | New league created within 30 s, no magic-link required. User is admin on both. | US2 / SC-007 |
| 9 | Submit `/sign-up` again with the SAME email as the new user. | Generic confirmation. No new league. The user receives a sign-in (not signup) magic-link. | FR-007 / R6 |
| 10 | Submit `/sign-up` with a different email but the SAME mini-league ID as an existing league. | Inline 409: "This FPL mini-league is already tracked." No magic-link sent. | FR-008 |
| 11 | Submit `/sign-up` with a typo'd FPL ID. | Inline 400: "No FPL mini-league with that ID exists." No magic-link sent. | FR-021 |
| 12 | Submit `/sign-up` 6 times in 60 s from the same IP with different emails. | First 5 may issue tokens; 6th onward returns generic confirmation but no token. | FR-012 |
| 13 | Submit `/sign-up`, then DO NOT click the magic-link for 20 minutes. Check the audit log. | Zero `league.created.self_signup` events for that email. Zero `UserAccount` / `League` rows for that email. | FR-011a |
| 14 | While signed in, hit `/sign-up` directly. | Page renders "You're already signed in — go to /leagues or create another league →" with two links. The form is NOT rendered. | R12 / edge case |
| 15 | As Super Admin, suspend the new league via `/platform/leagues/[id]/suspend`. | League becomes suspended (existing 002 behaviour). User can still see it in `/my-admin` (per 002) but member endpoints are gated. | FR-015 |

All 15 rows green ⇒ feature is ready to promote to production.

---

## How to enable for production

The feature has no environment-specific gate (per FR-016). Once the source is merged to `main` and deployed via `scripts/deploy.sh`, the public `/sign-up` page is reachable. There is no feature flag to toggle.

If the operator decides to **disable** public sign-up at some later date — e.g., the platform has reached a desired user count and they want to lock it down — the simplest revert is a follow-up PR that removes the "Create one →" link from `/sign-in` and returns 410 Gone from `/sign-up` and `/api/auth/signup`. Existing signed-up users are unaffected.
