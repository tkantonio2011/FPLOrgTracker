# Feature Specification: Public sign-up for League Admins

**Feature Branch**: `005-public-signup`
**Created**: 2026-05-22
**Status**: Draft
**Input**: User description: "I would like there to be a functionality that allows public sign up. Newly signed up users would then be admins of their leagues they manage."

## Clarifications

### Session 2026-05-22

- Q: Should public sign-up respect the UAT allow-list (`UAT_ALLOWED_EMAILS` from feature 004)? → A: No — public sign-up accepts any email on every environment, including UAT. This deliberately weakens the 004 spec's UAT allow-list: once any email can create a `UserAccount` via self-signup, that email can then sign in via magic-link (the allow-list only controlled new sign-ins to existing accounts). The operator accepts that UAT no longer has an effective access gate after this feature ships. Filing a follow-up to remove the now-bypassable UAT allow-list code is recommended but out of scope here.
- Q: When is the `League` row actually created — at form submit, or at magic-link click? → A: At magic-link click. Form submission only issues a single-use self-signup token that carries the desired league name and FPL mini-league ID. If the user never clicks the link, no `UserAccount`, no `League`, no `LeagueMembership`, and no `league.created.self_signup` audit event is ever written. This makes the entire pre-click state cheap to clean up (the token TTL handles it), keeps abusers from burning slug names or claiming FPL mini-league IDs with throwaway emails, and mirrors how 002 already defers `LeagueMembership` creation to invitation acceptance.
- Q: When is the FPL mini-league ID verified against the FPL API? → A: At form submission, before the self-signup token is issued. If the FPL API confirms "no such mini-league", the form returns an inline error so the user can correct the ID and resubmit (no token, no email). If the FPL API is unreachable or returns a transient failure, the submission is accepted, the token is issued, and the eventual `League` row is marked unverified so the user can re-trigger verification from the league settings page after sign-in.
- Q: What are the concrete rate-limit thresholds on the sign-up endpoint? → A: Reuse the existing magic-link buckets defined in `src/lib/auth/magic-link.ts`: **5 attempts per minute per email**, **30 attempts per hour per email**, **20 attempts per minute per IP**. Sign-up traffic shares the same in-process rate-limit buckets as sign-in (no second subsystem). Exceeding any bucket triggers the same generic no-op response defined by FR-013.
- Q: How is the sign-up surface discoverable from `/sign-in`? → A: Adjacent link. `/sign-in` keeps its existing single-email-field form; a "Don't have a league yet? Create one →" link is rendered below the submit button and navigates to `/sign-up`. Sign-in and sign-up live on separate pages — no auto-pivot, no tabs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A new user signs up and immediately becomes admin of their first league (Priority: P1)

A Fantasy Premier League manager hears about the platform from a friend, visits the public sign-in page, and chooses "Create a league" (or equivalent) instead of "Sign in". They enter their email address, their FPL mini-league ID, and a name for the league. They receive a magic-link in their inbox, click it, and land directly inside their newly-created league as that league's admin. No Super Admin intervention was required.

**Why this priority**: This is the whole point of the feature — the platform shifts from invitation-only to self-serve for league creation. Without this path working end-to-end, the feature delivers no value. Everything else (multi-league, prevent-abuse, edge cases) is in support of this single journey.

**Independent Test**: Starting from a clean browser and an email address with no existing `UserAccount`, an operator visits the platform's public URL, completes the sign-up form, receives the magic-link, clicks it, and is dropped into `/l/<their-new-slug>/admin/settings` as League Admin of a freshly-created `League`. The new league appears in `/leagues` and in the Super Admin's `/platform/leagues` console.

**Acceptance Scenarios**:

1. **Given** a public visitor with no existing account, **When** they submit the sign-up form with email, league name, and mini-league ID, **Then** within 2 minutes they receive a magic-link email and clicking it signs them into a brand-new league as its admin.
2. **Given** a successful sign-up, **When** the visitor navigates to `/leagues`, **Then** their new league appears and they can navigate into `/l/<slug>/admin/*` without permission errors.
3. **Given** a successful sign-up, **When** the existing Super Admin views `/platform/leagues`, **Then** the new league appears in the list with the new user's email as initial admin and an audit-event explaining how it was created (`league.created.self_signup`).
4. **Given** the same sign-up form, **When** the visitor enters an email that already has a `UserAccount`, **Then** the form returns a generic "if your details match, you'll receive an email" response identical to the success path, and the existing user receives an email pointing them at the sign-in flow — no new league is created and no enumeration of existing accounts is possible.

---

### User Story 2 — Existing user creates a second (or further) league (Priority: P2)

After a user has signed up and run one league for a while, they want to set up a second league for a separate group of friends. They sign in normally, click "Create another league" from `/leagues` or `/my-admin`, fill in the same fields as the public form (league name, mini-league ID), and become admin of the second league as well.

**Why this priority**: Without this, a power user has to either re-sign-up with a second email (clumsy) or ask the Super Admin to create the league for them (defeats the self-serve premise). P2 because the platform still functions for the average user without it.

**Independent Test**: A user with one existing league signs in, creates a second league via the in-app form, and confirms (a) they hold the `admin` role on both leagues, (b) the two leagues are fully data-isolated from each other, and (c) the league switcher shows both with admin chips.

**Acceptance Scenarios**:

1. **Given** a signed-in user who already administers one league, **When** they submit the "create another league" form, **Then** the new league is created immediately (no second magic-link required), they are added as its `admin`, and they are redirected to `/l/<new-slug>/admin/settings`.
2. **Given** a user administers two or more leagues, **When** they sign in, **Then** the `/leagues` page partitions their leagues into "Leagues you administer" and "Leagues you're a member of" — both groups visible side by side.

---

### User Story 3 — Abuse and rate-limiting at the sign-up boundary (Priority: P1)

The platform owner does not want anyone to be able to spam-create leagues, scrape the platform with throwaway accounts, or use the sign-up form as a vector to send junk email through the platform's outbound SMTP. The sign-up form must be **rate-limited** (per IP and per email), must require an action that confirms the email address is real (magic-link delivery is the implicit gate), and must surface administrative tools to revoke an abusive sign-up.

**Why this priority**: A public form on the open internet that creates database rows and sends outbound email is a standing abuse target. Without rate-limiting and admin revocation, the first time someone discovers the URL it becomes a problem. P1 alongside the happy path.

**Independent Test**: An attacker script that POSTs the sign-up form 100 times in 60 seconds from one IP, with 100 distinct made-up emails, results in at most a small bounded number of league rows being created (e.g., ≤ 5), and the existing rate-limit mechanism returns the same response shape so the attacker cannot tell which requests were processed deeply. The Super Admin can later view the audit trail and bulk-suspend any leagues created by the abuse.

**Acceptance Scenarios**:

1. **Given** any single IP submits more than 20 sign-up forms in 60 seconds, **When** the 21st request arrives, **Then** the server's response is the same generic "if your details match, you'll receive an email" string, but no self-signup token is issued and no email is sent — and a server-side log records the rate-limit hit. (Per FR-012, the 20/min/IP bucket is shared with sign-in.)
2. **Given** a single email address has triggered the per-email bucket (5 attempts in 60 seconds or 30 attempts in 1 hour), **When** the next attempt arrives, **Then** the server treats it the same as the per-IP rate-limit case (silently no-op, generic response, no token).
3. **Given** the Super Admin sees a league created via self-signup that looks abusive, **When** they suspend it via the existing `/platform/leagues/[id]/suspend` flow, **Then** the league is suspended (per existing 002 spec FR semantics) and the user account can be separately disabled via `/platform/users/[id]/disable`. No new admin UI is required by this feature.

---

### User Story 4 — A signed-up user creates a league with the same name or mini-league ID as an existing one (Priority: P2)

A user signs up wanting to create a league called "The Sunday Crew" — but a different user already created a league with that exact display name. Separately, a user tries to import a league using FPL mini-league ID `12345` — but the platform already tracks that ID. The system must handle both cases gracefully and never silently take over someone else's league.

**Why this priority**: Without this, a malicious user could enter another league's mini-league ID to gain admin over data that already belongs to someone else, or two users end up with confusingly identical slugs. P2 because it is a defensive correctness issue rather than a happy-path requirement.

**Independent Test**: Two users sign up consecutively with the same league name → the second receives a usable URL slug different from the first's (e.g., auto-suffixed or rejected with a clear error). A user attempting to claim a mini-league ID already in use is refused with a clear error message, and the existing league's admin sees no change to their league.

**Acceptance Scenarios**:

1. **Given** League A already exists with display name "The Sunday Crew" and slug `the-sunday-crew`, **When** a new user signs up with the same display name, **Then** the system either auto-suffixes the new slug (`the-sunday-crew-2`) and creates the league, or refuses with a clear "please choose a different name" message — never silently merges the two.
2. **Given** League A already exists with FPL mini-league ID `12345`, **When** a new user signs up entering mini-league ID `12345`, **Then** the system refuses with "this FPL mini-league is already tracked by another league on this platform" and does NOT create the new league.
3. **Given** an FPL mini-league ID is in any "pending verification" state because of the previous case, **When** the rejected user contacts support (the existing platform owner), **Then** the platform owner has enough information (FPL ID, both involved user emails) in the audit log to resolve the ownership dispute manually.

---

### Edge Cases

- **Disabled accounts trying to re-sign-up**: A `UserAccount` that has been disabled (via `/platform/users/[id]/disable`) attempts to sign up again with the same email. The form must return the same generic response as any other duplicate-email submission — no enumeration of "your account is disabled" — and no new league must be created.
- **Signed-up user re-runs the public form**: A user who already has an account fills out the public sign-up form again. The system must treat this as a sign-in request (send a magic-link to the existing account) and NOT create a new league or new account.
- **Invalid FPL mini-league ID**: A user enters a mini-league ID that does not exist on the FPL API. Per FR-021, the form returns an inline "no league with that ID exists on FPL — please check the number" error so the user can correct the ID and resubmit. No token is issued, no email is sent.
- **FPL API is offline at sign-up time**: Per FR-021a/FR-021b, the verification call has a ≤ 3 s timeout; a timeout or unreachable response is treated as inconclusive (not negative). The sign-up token is issued, the user receives the magic-link, and the eventually-created `League` carries an "FPL verification pending" flag visible in the league settings page so the user can re-verify later. The flow does not block on transient FPL API outages.
- **UAT environment**: Per the Clarifications section, public sign-up is **not** gated by `UAT_ALLOWED_EMAILS`. Any email can sign up on UAT exactly as on production. The operator has accepted that this turns the 004 UAT allow-list into a no-op gate (anyone can self-signup, then sign in normally) and treats UAT as functionally open after this feature ships.
- **Sign-up while signed in**: A user who is already signed in to one league hits the public sign-up form (e.g., from a bookmarked URL). The form must redirect them to the in-app "create another league" path (User Story 2) rather than creating a duplicate account.
- **Mini-league ID = 0 or negative**: Reject with a validation error before any DB writes.
- **League name that's only whitespace or emoji-only**: Reject with a validation error.
- **Two users race to claim the same FPL mini-league ID**: The DB-level unique constraint on `League.miniLeagueId` enforces "first writer wins" — the second user receives the same error as User Story 4 scenario 2. Because creation is deferred to click time (FR-011), both users can legitimately receive a magic-link; only the first click materialises the league.
- **Self-signup token expires unused**: A visitor submits the form but never clicks the magic-link (closed the email, lost interest). After the token TTL the row is garbage-collected. No `UserAccount`, no `League`, and no slug reservation is left behind (FR-011a). The same email may submit the form again at any time.
- **User clicks an expired or already-used self-signup link**: They land on the `/verify?error=expired` or `/verify?error=used` page (same as the existing 002 sign-in failure UX). They may submit the sign-up form again to issue a fresh token.

## Requirements *(mandatory)*

### Functional Requirements

#### The sign-up form and flow

- **FR-001**: The platform MUST expose a publicly-accessible sign-up page that requires no authentication to view.
- **FR-002**: The sign-up form MUST accept at minimum: email address, league display name, and FPL mini-league ID.
- **FR-003**: On a valid submission, the platform MUST send a magic-link email to the supplied address; clicking that link MUST sign the user in and place them in their newly-created league as that league's admin.
- **FR-004**: The post-sign-up landing destination MUST be the new league's admin shell (`/l/<slug>/admin/...`), not a generic dashboard, so the user immediately sees their own context.
- **FR-005**: The system MUST grant the newly-created user `admin` role on the newly-created league via the existing `LeagueMembership` mechanism — public sign-up does NOT introduce a new role or a new admin-grant pathway.
- **FR-006**: Public sign-up MUST NOT grant the new user `SuperAdmin` privileges under any circumstance. Super Admin is only ever granted by the existing bootstrap mechanism (002-multi-league-platform) or by an existing Super Admin promoting via `/platform/users`.

#### Account and league creation

- **FR-007**: If the submitted email already has a `UserAccount`, the platform MUST NOT create a new account and MUST NOT create a new league from that submission. Instead, the existing account receives a magic-link as if they had used the normal sign-in flow.
- **FR-008**: If the submitted FPL mini-league ID already exists in the platform's `League.miniLeagueId` column, the platform MUST refuse the sign-up with a clear, user-readable error (`"This FPL mini-league is already tracked. If you should be its admin, contact support."`).
- **FR-009**: League slug generation MUST be deterministic from the display name, MUST collision-check against existing slugs and slug history, and MUST auto-suffix on collision (`the-sunday-crew-2`, `the-sunday-crew-3`, ...) rather than fail.
- **FR-010**: The display name MUST pass the same validation as the existing League creation surface (non-empty after trim, length cap, no purely-whitespace, no control characters). A failed validation MUST return a clear inline error and create no rows.
- **FR-011**: Account and league creation MUST happen atomically at **magic-link click time** — either the `UserAccount`, `League`, `LeagueMembership`, and audit event all land in a single transaction, or none of them do. Form submission itself MUST NOT write any of these rows; it only issues a single-use self-signup token carrying the desired league name and FPL mini-league ID (see "Self-Signup Token" entity below).
- **FR-011a**: If the self-signup token expires unused (the user never clicks the magic-link within the token TTL), the system MUST leave **no** trace: no orphan `UserAccount`, no orphan `League`, no orphan slug reservation, no orphan FPL-mini-league claim. The only artefact is the expired token row, which the existing magic-link cleanup process garbage-collects.
- **FR-011b**: Two visitors who submit the form with the same desired FPL mini-league ID before either has clicked their link MUST both receive a magic-link, but only **the first** to click MUST succeed (creates the league with that mini-league ID); the second click MUST fail with the same "this FPL mini-league is already tracked" error from FR-008, and no rows for the second user MUST be written. This is enforced by the existing DB-level unique constraint on `League.miniLeagueId`.

#### Anti-abuse

- **FR-012**: The sign-up endpoint MUST share the existing magic-link rate-limit buckets defined in `src/lib/auth/magic-link.ts` (5 / minute / email, 30 / hour / email, 20 / minute / IP). Sign-up traffic and sign-in traffic count against the same buckets. Exceeding any bucket MUST silently no-op with the same generic response as the success path (FR-013) — no information leakage about which limit was hit.
- **FR-013**: The sign-up endpoint MUST return the same generic response (HTTP status + body shape) for all non-error paths: success, duplicate email, rate-limited, and invalid-mini-league-ID-but-otherwise-valid. The only differentiated responses are inline form validation errors (display name format, email format) and the duplicate-mini-league-ID error (FR-008), because those are about user-visible correctness rather than enumeration risk.
- **FR-014**: Every successful and every rejected sign-up MUST emit an audit event (`league.created.self_signup` and `signup.rejected.<reason>`) consumable from the existing `/platform/audit` console.
- **FR-015**: A Super Admin MUST be able to view, suspend, and disable any league or user account created via public sign-up using the existing `/platform/leagues/[id]/suspend` and `/platform/users/[id]/disable` flows. No new admin UI is required by this feature.

#### Environment behaviour

- **FR-016**: Public sign-up MUST accept any email address on every environment (production, UAT, and any future preview environment). There is no per-environment allow-list, suffix-list, or domain whitelist.
- **FR-017**: This feature deliberately bypasses the UAT allow-list defined in spec 004 (FR-009). After this feature ships, the 004 UAT allow-list provides no effective gate, because any visitor can self-signup and immediately sign in. Removing the now-redundant UAT allow-list code is a recommended follow-up tracked separately.
- **FR-018**: The sign-up surface MUST live at its own URL (`/sign-up`) and MUST be discoverable from the existing `/sign-in` page via an adjacent text link rendered below the sign-in form's submit button ("Don't have a league yet? Create one →" or equivalent). The sign-in form itself MUST NOT change shape or pivot based on whether the entered email exists; it keeps its single-email-field design from spec 002.

#### FPL mini-league verification

- **FR-019**: At form submission, BEFORE issuing the self-signup token, the platform MUST attempt to verify the supplied FPL mini-league ID against the public FPL API. The check is synchronous from the user's perspective — they wait for the form response.
- **FR-020**: If the FPL API responds within the verification timeout and confirms the mini-league exists, the platform MUST issue the self-signup token and proceed. The FPL-supplied league name MAY be surfaced to the user post-sign-in as a suggested alternative to their entered display name.
- **FR-021**: If the FPL API responds and returns "no such mini-league" (or any equivalent definitive negative response), the form MUST return an inline `signup.rejected.fpl_api_no_such_league` error so the user can correct the ID and resubmit. No self-signup token is issued, no email is sent, no rows are written.
- **FR-021a**: If the FPL API is unreachable, times out, or returns an unexpected response, the platform MUST treat the verification as **inconclusive** rather than failed: it MUST issue the self-signup token and let the flow proceed. The eventual `League` row MUST be created with an "FPL verification pending" flag visible on the league's settings page so the user can re-trigger verification once the FPL API is healthy again. The flow MUST NOT block on transient FPL API outages.
- **FR-021b**: The FPL verification call at sign-up MUST have a strict timeout (≤ 3 seconds) so that a slow FPL API never makes the user wait. A timeout is treated as "inconclusive" per FR-021a.

### Key Entities

- **Self-Signup Token**: A single-use, short-lived token issued at form submission. Carries the submitting email, the desired league display name, the desired FPL mini-league ID, the client IP, and an expiry timestamp. Persisted (so a magic-link click on a different device still works) but expires automatically. Consuming the token at click time creates the `UserAccount`, `League`, `LeagueMembership`, and audit event in one transaction (FR-011). An expired or already-consumed token MUST NOT produce any side effects on a second click.
- **UserAccount** (existing — 002): Now reachable via public sign-up as a creation path, in addition to the existing invitation and bootstrap paths.
- **League** (existing — 002): Now creatable from outside the Super Admin console. The `League.createdByUserAccountId` column already exists from 002 and is set to the self-signed-up user's account id.
- **LeagueMembership** (existing — 002): Now creatable as a side-effect of self-signup. Role is always `admin` for the signup creator.
- **AuditEvent** (existing — 002): New action codes: `league.created.self_signup`, `signup.rejected.duplicate_email`, `signup.rejected.duplicate_mini_league_id`, `signup.rejected.rate_limited`, `signup.rejected.uat_allow_list`, `signup.rejected.fpl_api_no_such_league`. Existing audit consumer at `/platform/audit` shows these.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor with no prior contact with the platform can complete sign-up and land in their new league as admin in **under 4 minutes** end-to-end (form → email → click → admin shell), assuming the user's email arrives within 2 minutes.
- **SC-002**: **Zero** Super Admin actions are required for a successful sign-up to complete. The Super Admin's involvement is only required if the sign-up is rejected by FR-008 (duplicate FPL ID) and the user contacts support manually.
- **SC-003**: **100%** of newly-created leagues from public sign-up are owned only by the signing-up user — they are visible in `/platform/leagues` to Super Admin, but no other regular user account has any role or membership on the new league until the new admin explicitly invites them.
- **SC-004**: A single IP attempting 100 sign-ups in 60 seconds results in **no more than 20** self-signup tokens being issued (per FR-012's 20/min/IP cap) and consequently no more than 20 magic-link emails sent. Of those 20 tokens, only the ones whose magic-link is clicked within the token TTL turn into `League` rows. The remaining 80 form submissions produce the same generic response but no token, no email, and no DB rows.
- **SC-005**: Public sign-up succeeds for **any** valid email address on **every** environment, verified by an acceptance test that creates a fresh league on both production and UAT using a never-before-seen email and confirms the new league is reachable as admin without any operator intervention.
- **SC-006**: A user signing up with an FPL mini-league ID already claimed by another league receives a clear, actionable error message; **zero** silent ownership transfers occur in the league data, verified by inspecting the audit log for any `league.created.self_signup` events that reference a mini-league ID already in `League.miniLeagueId`.
- **SC-007**: A signed-in user with one league can create a second league through the in-app "create another league" flow in **under 30 seconds** (no magic-link required for a signed-in user).

## Assumptions

- **Auth mechanism reuses magic-link**: The existing magic-link sign-in flow is the verification step for new sign-ups; no password is collected. This is consistent with the 002 spec's decision to remove passwords entirely.
- **FPL mini-league ID is required, not optional**: A league with no FPL mini-league ID would be useless on this platform (every analytics page reads from FPL data). Sign-up enforces the same requirement; the existing `League.miniLeagueId` column is nullable but new self-signups never produce a null.
- **No payment / no plan tiers**: Sign-up is free; there is no plan picker, no Stripe integration, no quota except the per-IP / per-email rate limits.
- **Email deliverability uses existing SMTP**: Outbound email continues through whatever SMTP configuration is set in environment variables. No new email-provider relationship is introduced.
- **One league per signup form submission**: The first league is created during sign-up; subsequent leagues are created via the in-app "create another league" flow (User Story 2). A user cannot create a batch of leagues in a single submission.
- **No allow-list on any environment**: Per Clarifications, public sign-up accepts any email everywhere. This is a deliberate weakening of the 004 UAT allow-list — the operator has accepted that UAT is effectively open after this feature ships.
- **Super Admin governance is unchanged**: Existing 002 mechanisms — suspend league, disable user, audit feed — are sufficient to manage abusive sign-ups. No new admin surface is in scope for this feature.
- **No CAPTCHA in v1**: Rate limiting + per-email magic-link verification is the v1 abuse defence. CAPTCHA is left as a possible follow-up if abuse rates indicate it's needed.
- **No additional profile fields**: Sign-up collects email, league name, mini-league ID. It does NOT collect a display name for the user, a phone number, a real name, or any other PII beyond what's strictly needed to bootstrap them as a League Admin. The user can fill in optional profile data from their league settings later.
- **Slug auto-suffix policy**: Per FR-009, slug collisions are resolved by appending `-2`, `-3`, ... rather than rejecting the sign-up. The user can later rename the league (002 already supports slug renames with `LeagueSlugHistory`).
- **In-app "create another league" form**: User Story 2 introduces a small in-app form. The exact location (sidebar button, page on `/leagues`, page on `/my-admin`) is a UX choice for the planning phase; the requirement is only that the form exists and is reachable from at least one obvious place after sign-in.
