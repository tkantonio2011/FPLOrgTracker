# Feature Specification: UAT / Test Environment

**Feature Branch**: `004-uat-deployment`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "I would like to deploy this solution to an UAT/test environment."

## Clarifications

### Session 2026-05-21

- Q: Where does UAT run relative to the existing production EC2 instance? → A: A separate dedicated EC2 instance (matching the production instance class), with its own Elastic IP / hostname and its own local SQLite file, fully isolated from production at the OS and network level.
- Q: When refreshing UAT from production, which fields must be sanitised / stripped? → A: None — UAT is permitted to hold a straight copy of production data. The allow-list (FR-009) and the bootstrap-account separation (FR-012) are the sole controls on who sees that data. Active sessions and auth tokens are still excluded so production users cannot bypass the UAT allow-list, but other content (emails, display names, league names, audit payloads, FPL manager/team names) is copied verbatim.
- Q: How does UAT send outbound email (magic-links, invitations, digests)? → A: Same SMTP configuration as production — same provider, same sender identity, same subject formatting. There is no separate UAT email lane and no visual distinguishability of UAT vs production email. The allow-list (FR-009) is the sole control preventing UAT email from reaching real production members; the on-page UAT banner (FR-021) remains the primary "which environment am I in" indicator.
- Q: How does the operator maintain the UAT allow-list? → A: An environment variable read at app startup (e.g., `UAT_ALLOWED_EMAILS="a@x.com,b@y.com"`), mirroring the existing `BOOTSTRAP_SUPER_ADMIN_EMAIL` pattern. Updating the list requires editing the env file on the UAT host and restarting the UAT process. No new admin UI is introduced. The env file is the audit trail of who has ever been allow-listed.
- Q: What URL / hostname pattern does UAT use? → A: A raw Elastic IP, no DNS (e.g., `http://<UAT-EIP>/`), matching the current production posture (`http://3.82.78.1/`). No TLS, no certificate. Magic-link URLs in UAT email will therefore look like `http://<UAT-EIP>/auth/...`. The IP being distinct from production satisfies FR-002 "clearly distinct URL".

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Validate a release candidate before it touches production (Priority: P1)

The platform owner (currently the Super Admin) wants a place where a new build of the app can be stood up and exercised end-to-end **before** it is promoted to the live deployment that real league members use. They need an environment that looks and behaves like production (same code path, same configuration shape, same database schema) but is **data-isolated** from production — its own URL, its own database, its own admin bootstrap account, its own allow-list — so that nothing they do during testing writes to the production database. (UAT shares the production SMTP sender identity by design; see Clarifications.)

**Why this priority**: Without this, every release goes straight to the production environment that real members use. A single bad migration, broken admin flow, or misconfigured email can corrupt member data or send confusing messages to real users. P1 because it is the single biggest production-safety gap today.

**Independent Test**: From a clean state, a release candidate can be deployed to the UAT environment, a test Super Admin can sign in via magic-link, create a test league, and exercise the league-admin flow — all while production remains untouched and the UAT and production databases remain entirely separate.

**Acceptance Scenarios**:

1. **Given** a release candidate has been built locally, **When** the operator runs the documented "deploy to UAT" command, **Then** the new build is live on the UAT URL within 10 minutes and the production URL is unaffected.
2. **Given** a tester signs in to the UAT environment, **When** they create a league, invite a member, and run an FPL sync, **Then** the data is written only to the UAT database and no records appear in production.
3. **Given** the UAT environment sends a magic-link or invitation email to an allow-listed tester, **When** the tester clicks the link, **Then** the link takes them to the UAT URL (not production), and the on-page UAT banner (FR-021) makes the environment obvious. Email body, sender, and subject are intentionally identical to production.
4. **Given** a UAT release passes acceptance, **When** the operator deploys the same build to production, **Then** the deploy uses the same artifacts and the same documented procedure — there are no UAT-only code paths in the build.

---

### User Story 2 — Refresh UAT with a copy of production for realistic testing (Priority: P2)

Periodically (e.g. before testing a risky schema change or a new admin flow), the operator wants to refresh the UAT database from a recent snapshot of production so testers can validate against realistic data volumes and edge cases — large leagues, unusual ownership patterns, long-running members, real audit history. Member content (emails, display names, league names, audit payloads) is copied verbatim; active sessions and auth tokens are excluded so that production users cannot use a live session to bypass the UAT allow-list.

**Why this priority**: Empty or hand-crafted test data hides real bugs. Copying production into UAT closes that gap, but the platform can still ship and validate releases without it — so P2. The operator accepts that allow-listed testers will see real production data and that the allow-list (FR-009) plus a separate bootstrap account (FR-012) are the only controls on disclosure.

**Independent Test**: Run the "refresh UAT from production" procedure end-to-end and verify that (a) UAT is populated with production data, (b) the original production Super Admin email is no longer privileged in UAT — only the UAT-only bootstrap account is, (c) no production session or magic-link token from the snapshot grants access in UAT, and (d) production is untouched.

**Acceptance Scenarios**:

1. **Given** a production snapshot has been taken, **When** the operator runs the documented refresh procedure, **Then** the UAT database is replaced with that snapshot and no session record or magic-link token from the snapshot is usable for sign-in in UAT.
2. **Given** UAT has just been refreshed, **When** a tester signs in, **Then** sign-in succeeds for the UAT bootstrap Super Admin account, the production Super Admin email no longer grants Super Admin in UAT, and only allow-listed addresses (FR-009) receive a magic-link.

---

### User Story 3 — Restrict UAT access to internal testers only (Priority: P1)

Because UAT may contain pre-release functionality, in-flight bugs, and (when refreshed) a verbatim copy of production data, the operator wants UAT reachable only by people they have explicitly authorised. The expectation is "obscure URL + magic-link sign-in + an allow-list of tester emails" — not full public exposure.

**Why this priority**: With no sanitisation step (User Story 2), the allow-list is the *only* control standing between UAT testers and real member data. A misconfigured allow-list is a data-exposure incident. Raised from P2 to P1 once the no-sanitisation decision was taken.

**Independent Test**: A tester whose email is on the UAT allow-list can sign in; a tester whose email is not on the allow-list is shown an "access denied" page even if they know the magic-link URL pattern; search-engine crawlers see a `noindex` response.

**Acceptance Scenarios**:

1. **Given** an email address is **not** on the UAT allow-list, **When** that address requests a magic-link, **Then** no link is delivered and the user sees a generic "if your address is authorised, you'll receive a link" response (no enumeration).
2. **Given** an email address **is** on the UAT allow-list, **When** that address requests a magic-link, **Then** the link is delivered and sign-in succeeds.
3. **Given** any public web crawler requests any UAT page, **When** the response is returned, **Then** the response includes a directive that tells crawlers not to index the page.

---

### User Story 4 — Roll back the UAT environment without affecting production (Priority: P3)

If a UAT deploy goes badly (broken migration, crashed process, corrupted data), the operator wants to roll the UAT environment back to the previous known-good build and database state quickly, without touching production. The recovery path for UAT should mirror the recovery path for production so the team gets practice using it.

**Why this priority**: UAT-only failures are tolerable in the short term — production is the priority — so P3. But practising rollback in UAT is how the team builds confidence in the production rollback path.

**Independent Test**: After a deliberately-broken UAT deploy, the operator runs the documented rollback procedure and verifies that UAT serves the previous build and the previous database snapshot, with the procedure taking no longer than the documented target.

**Acceptance Scenarios**:

1. **Given** a UAT deploy has left the environment in a broken state, **When** the operator runs the documented rollback procedure, **Then** UAT returns to the previous build and previous database snapshot within the documented time budget.
2. **Given** UAT is being rolled back, **When** the rollback is in progress, **Then** the production environment is unaffected and continues to serve traffic normally.

---

### Edge Cases

- **Misdirected production traffic**: What happens if a tester accidentally tries to sign in with their *production* email on UAT? They must be denied unless the same email is also on the UAT allow-list, and the response must not leak which environment they would have access to.
- **Cross-environment email confusion**: UAT and production use the same SMTP sender by design (see Clarifications). The recipient cannot tell the messages apart from the email itself; they can only tell once they click the link, because the magic-link URL points at the UAT hostname and the UAT page carries the on-page banner (FR-021). Mitigation relies on the allow-list (FR-009) ensuring that only people who *expect* to receive UAT mail are eligible to receive any at all.
- **Stale UAT data**: What happens if UAT has not been refreshed in months and the schema has moved? UAT must run the same migration path as production on deploy, so a stale UAT database either migrates cleanly or fails loudly — never silently diverges.
- **UAT outage during a production incident**: What happens if both environments are unhealthy at the same time? Production must always recover first; UAT is restored on a best-effort basis.
- **Search-engine indexing**: If UAT is indexed before the indexing directive is in place, the operator must be able to request removal from search engines. (Risk is low in practice — UAT has no DNS name, only a raw Elastic IP, which crawlers rarely fetch unsolicited.)
- **Magic-link looks like phishing**: Because UAT email reuses the production sender (FR-004 clarification) but the magic-link URL is a raw IP, allow-listed testers may flag the email as phishing. Mitigation: the operator briefs testers on the IP before adding them to `UAT_ALLOWED_EMAILS`.
- **Free-tier exhaustion**: If UAT shares a free-tier cloud account with production and the combined usage exceeds the free allowance, costs will appear. The operator must be aware before deployment that UAT may push usage past the free tier.

## Requirements *(mandatory)*

### Functional Requirements

#### Environment isolation

- **FR-001**: The platform MUST run UAT and production as two fully isolated environments — separate URLs, separate databases, and separate admin bootstrap accounts. Outbound email configuration is shared (see FR-004).
- **FR-002**: UAT MUST be reachable at a URL whose host part is a different Elastic IP than the production URL. No DNS hostname is configured for UAT; the URL is the raw IP (`http://<UAT-EIP>/`). This matches the current production HTTP-only posture.
- **FR-003**: UAT MUST never read from or write to the production database under any circumstance, including during refresh, deploy, or rollback.
- **FR-004**: UAT MAY use the same SMTP configuration, sender identity, and subject formatting as production. Outbound UAT email is **not** required to be visually distinguishable from production email. Magic-link URLs in UAT email MUST nevertheless point at the UAT hostname (FR-002), so a click never lands a tester on production by accident.

#### Deployment

- **FR-005**: The platform MUST support deploying any built release candidate to UAT using a documented, repeatable procedure runnable by a single operator.
- **FR-006**: A successful UAT deploy MUST be promotable to production by deploying the same release candidate artefacts — there must be no UAT-only code paths or build flags that would cause the production build to behave differently.
- **FR-007**: Deploying to UAT MUST NOT require taking production offline or pausing production traffic.
- **FR-008**: After a UAT deploy, the operator MUST be able to confirm the environment is healthy via documented smoke checks (sign-in works, a league page renders, an admin action records an audit event).

#### Access control

- **FR-009**: UAT MUST restrict sign-in to an allow-list of tester email addresses. The allow-list is supplied as an environment variable read at app startup (comma-separated email addresses), matching the pattern of the existing `BOOTSTRAP_SUPER_ADMIN_EMAIL` configuration. Updates take effect on the next process restart. The same configuration variable MUST be absent or empty in production so the production environment does not silently inherit an allow-list mode.
- **FR-010**: UAT MUST return the same generic response for both allow-listed and non-allow-listed magic-link requests so that the allow-list cannot be enumerated.
- **FR-011**: UAT pages MUST instruct public web crawlers not to index them.
- **FR-012**: The UAT bootstrap Super Admin account MUST be different from the production bootstrap Super Admin account so that a credential or address leak in one environment does not compromise the other.

#### Data refresh

- **FR-013**: The platform MUST provide a documented procedure for refreshing UAT from a snapshot of the production database.
- **FR-014**: Member content (emails, display names, league names, audit-event payloads, FPL-derived manager / team names) MAY be copied verbatim from production to UAT — sanitisation is not required. The operator accepts that allow-listed testers will see real production member content, and the controls in FR-009 (allow-list) and FR-012 (separate bootstrap account) are the sole safeguards against onward disclosure.
- **FR-015**: After a refresh, UAT MUST NOT contain any auth tokens, magic-link tokens, or active sessions copied from production. The post-refresh UAT database MUST require a fresh magic-link sign-in via the UAT allow-list for every user — no inherited session from production may grant access.
- **FR-016**: Refresh MUST be safe to repeat — running it twice in a row MUST leave UAT in the same final state as running it once.
- **FR-022**: After a refresh, role assignments in UAT MUST be such that the production Super Admin email no longer holds Super Admin in UAT; only the UAT-only bootstrap Super Admin (FR-012) does.

#### Rollback

- **FR-017**: The platform MUST support rolling UAT back to the previous build and previous database snapshot using a documented procedure.
- **FR-018**: UAT rollback MUST NOT affect the running production environment.
- **FR-019**: UAT MUST retain at least the last two database snapshots so a rollback target is always available.

#### Operational visibility

- **FR-020**: UAT MUST emit logs and audit events the same way production does, so operators can debug UAT issues using the same techniques as production.
- **FR-021**: Every UAT page MUST display a persistent, unmistakable visual indicator (e.g. a banner) that the user is in the UAT environment, visible on every page including admin pages.

### Key Entities

- **Environment**: A deployed instance of the platform. Each environment has a name (`production`, `uat`), a public URL, an isolated database, an outbound email lane, a bootstrap Super Admin email, and an allow-list (UAT only).
- **Release Candidate**: A built version of the application produced from a specific commit. The same release candidate is deployable to either environment without modification.
- **Production Snapshot**: A point-in-time copy of the production database used as the input for a UAT refresh. Member content is copied verbatim; only sessions and auth/magic-link tokens are excluded so a refresh cannot bypass the UAT allow-list.
- **UAT Allow-list**: The set of email addresses authorised to sign in to UAT. Managed by the operator and consulted on every UAT magic-link request. With no sanitisation step in place, the allow-list is the sole control on who sees real production member content in UAT.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can deploy a known release candidate to UAT, run the documented smoke checks, and confirm UAT is healthy in **under 15 minutes** from a clean working tree.
- **SC-002**: **100%** of production releases for the next 3 months are validated in UAT before being deployed to production.
- **SC-003**: **Zero** records created during UAT activity (sign-ins, league creation, FPL syncs, admin actions, audit events) ever appear in the production database, verified by an audit of both databases at the end of each calendar month.
- **SC-004**: An operator can roll UAT back to the previous build and previous database snapshot in **under 15 minutes**, demonstrated by a rehearsal at least once per quarter.
- **SC-005**: When a tester is asked to identify the environment they are in from any single page (member or admin), they correctly identify it as UAT **100%** of the time.
- **SC-006**: After a UAT refresh from production, an audit of the UAT database finds **zero** sessions, magic-link tokens, or auth tokens inherited from the production snapshot, and the production Super Admin email no longer holds Super Admin in UAT. (Member content such as emails and display names is allowed to be present — see FR-014.)
- **SC-007**: At every point in time, the UAT allow-list contains **only** addresses the operator has explicitly added; no production member is implicitly allow-listed by the refresh procedure. Verified by spot-check audits at least once per month.

## Assumptions

- **Same hosting model, separate instance**: UAT runs on its own dedicated EC2 instance (same instance class as production) with its own Elastic IP / hostname and its own local SQLite file. UAT does not share a host, process, port, or database file with production. The shared OS, kernel, or filesystem failure mode that exists with "same instance, different port" is therefore not in scope.
- **Same code path**: The application code does not need new environment-specific branches. Environment-specific behaviour (URLs, banners, allow-lists, outbound email identity) is configured via the existing `.env`-style configuration surface, not via code forks.
- **Operator role**: The "operator" is the existing Super Admin / platform owner. No new role is introduced. UAT does not need a separate ops team.
- **Audience**: UAT is for internal testers — the operator and people they explicitly add to the allow-list. UAT is **not** a public beta or a customer-facing preview.
- **HTTPS deferred**: UAT is served over plain HTTP behind a public IP, identical to the current production deployment. No DNS hostname is configured (see Clarifications). Adding TLS or a DNS hostname is out of scope for this feature. UAT magic-link emails will therefore contain `http://<UAT-EIP>/...` URLs, and testers may need to dismiss browser warnings about HTTP-only sites.
- **No new persistent storage product**: UAT continues to use a local SQLite file via the existing data-access layer. Moving to a managed database is explicitly out of scope here.
- **Refresh cadence is on-demand**: There is no automated scheduled refresh of UAT from production in this feature. Refresh runs only when the operator decides to run it.
- **Allow-list latency-to-revoke**: Because the allow-list is an env var read at startup (per Clarifications), revoking a tester requires editing the env file and restarting the UAT process. Revocation is therefore measured in tens of seconds, not milliseconds. This latency is accepted given the small tester audience.
- **Test data and fixtures**: The existing application has no concept of "demo data" beyond a real FPL sync. UAT test data will come from either (a) hand-crafted test leagues created by testers, or (b) a sanitised refresh from production (User Story 2). No new dedicated demo-data generator is in scope.
- **Free tier**: The existing production deployment runs on the AWS free tier. UAT is expected to fit in the same free-tier budget by using the same instance class; if it does not, the operator accepts the small cloud-provider charge.
- **Existing production secrets are excluded from this feature**: Rotation of any production secrets is tracked separately and must not be confused with UAT bootstrap. UAT must use its own independent secrets from day one.
- **No sanitisation of refreshed data**: Per the clarification in §Clarifications, UAT may hold a verbatim copy of production data (member emails, display names, league names, audit payloads, FPL-derived manager/team names). The allow-list (FR-009) and the separate UAT bootstrap account (FR-012) are explicitly accepted as the sole controls on disclosure. Production sessions and tokens are still excluded (FR-015) because copying them would functionally bypass the allow-list.
