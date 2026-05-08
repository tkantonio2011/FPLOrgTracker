# Feature Specification: Multi-League Platform

**Feature Branch**: `002-multi-league-platform`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "As it stands now, this application is tailored for energy trading company and is used by only one fantasy premier league league members. I would like make it suitable for running multiple fantasy premier league leagues, where each of the leagues would have their administrator as well as members. The different leagues members may belong to different companies, from different industries so we need to make sure that they don't have references only to one industry (like energy trading as is now). There also needs to be a superadmin function that will be the overall platform administrator and will be able to see all the leagues and all the members and manage them as well as separate leagues administrators."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - League Member Plays Within Their Own League (Priority: P1)

A member belonging to a specific league signs in to the app and sees the FPL tracker (leaderboard, performance, transfer suggestions, captain advisor, chip advisor, ownership view) scoped only to their league. They never see members, scores, or content belonging to other leagues. The branding and copy throughout the app are generic — no reference to any specific industry or company.

**Why this priority**: This is the entire point of multi-tenancy from the member's point of view. Without strict per-league isolation, the platform cannot host more than one league safely. This is also the highest-traffic path: every gameweek, every member, every page load.

**Independent Test**: Can be tested by creating two leagues with at least 2 members each, signing in as a member of League A, and verifying they see only League A members in the leaderboard, only League A averages in performance comparisons, and zero references to industry-specific or company-specific terminology anywhere in the UI.

**Acceptance Scenarios**:

1. **Given** I am a signed-in member of League A, **When** I open the leaderboard, **Then** I see only members of League A and a league name banner identifying my league, with no members from any other league visible.
2. **Given** I am viewing my personal performance page, **When** the page compares my score to "the league average", **Then** the average is computed only across members of my league, not across the entire platform.
3. **Given** I am navigating any page in the app, **When** I read page headings, navigation labels, footer text, or default email/notification copy, **Then** none of them reference a specific industry, company, or organisation name — all wording is generic and applies equally to any league.
4. **Given** I attempt to access a URL belonging to another league (e.g., by guessing a league ID or member ID in the URL), **When** the request is processed, **Then** I am denied access and shown a "not found" or "not authorised" response.

---

### User Story 2 - League Admin Sets Up and Runs Their League (Priority: P1)

A League Admin creates a new league, configures it (name, optional logo, FPL mini-league ID), invites members (either by importing the FPL mini-league or by sending email invitations), and from then on manages their league independently — adding/removing members, renaming members, and editing league settings — without needing involvement from the platform operator.

**Why this priority**: A multi-league platform is only viable if leagues are self-serve. Forcing a central operator to manually onboard every new league does not scale beyond a handful of leagues. League Admin self-service is what makes "multiple leagues" practical.

**Independent Test**: Can be tested by signing in as a League Admin who has just been granted that role, completing the league setup wizard, importing members from a real FPL mini-league, removing one and renaming another, and verifying the changes are visible only inside that league and persist across sessions.

**Acceptance Scenarios**:

1. **Given** I have been granted the League Admin role for a new league, **When** I open the league setup screen, **Then** I can enter a league name, optionally upload a logo, and enter an FPL mini-league ID, and I can save these settings.
2. **Given** I have entered an FPL mini-league ID, **When** I trigger member import, **Then** every manager in that mini-league appears as a member of my league with their FPL display name and team name pre-populated.
3. **Given** I want to add a member who is not in the configured mini-league, **When** I enter their FPL Manager ID manually, **Then** they are added to my league with FPL data fetched, marked as a manually-added member.
4. **Given** I select a member in my league, **When** I rename them or set them inactive, **Then** the change is visible to all members of my league on next refresh and is not visible to or modifiable by admins of other leagues.
5. **Given** another user holds the League Admin role for a different league, **When** they sign in, **Then** they see and can manage only their own league — they cannot see my league's settings or members.

---

### User Story 3 - Super Admin Manages Leagues and Admins Across the Platform (Priority: P2)

A Super Admin (the platform operator) signs in to a dedicated platform-administration area where they can see every league on the platform, see counts and last-active timestamps per league, drill into any league to view its members, promote a member to League Admin, demote a League Admin back to a member, transfer admin ownership to a different person, suspend or delete a league, and create new leagues with an initial League Admin assigned.

**Why this priority**: Without a Super Admin, the platform cannot recover from real-world events such as a League Admin leaving their company, a league being abandoned, abuse, billing disputes, or onboarding a new customer. It is essential operationally but not on the day-to-day critical path for members, hence P2 rather than P1.

**Independent Test**: Can be tested by signing in as a Super Admin, creating a new league with a designated League Admin, demoting an existing League Admin in another league, suspending a third league, and verifying that members see the correct effects (the suspended league's members can no longer access it; the demoted admin can no longer change settings) while no Super Admin actions affect leagues other than the ones explicitly targeted.

**Acceptance Scenarios**:

1. **Given** I am signed in as a Super Admin, **When** I open the platform admin dashboard, **Then** I see a list of every league on the platform with at least: league name, member count, current League Admin(s), creation date, and active/suspended status.
2. **Given** I am viewing the list of leagues, **When** I open a specific league, **Then** I see all members of that league and can promote any active member to League Admin or demote any League Admin to a regular member.
3. **Given** I want to onboard a new league, **When** I create a league through the platform admin area, **Then** I supply a league name and the email/identity of the initial League Admin, and that admin can immediately sign in and start configuring their league.
4. **Given** I suspend a league, **When** any member of that league attempts to access it, **Then** they see a message explaining the league is suspended and have no access to its data until it is reinstated.
5. **Given** I am signed in as a regular member or a League Admin, **When** I attempt to navigate to the platform admin area, **Then** I am denied and shown a "not authorised" response.

---

### User Story 4 - Existing Energy-Trading League Migrates to the New Platform (Priority: P2)

The original single-tenant deployment (the energy-trading company's mini-league) is preserved as the first league on the new multi-league platform. Existing members keep their FPL Manager IDs, display names, and historical context. A nominated person becomes the League Admin of this migrated league. All previously hard-coded references to the energy-trading company name, industry-specific copy, and one-off branding are removed from the application; the migrated league simply uses its own name as configured by its admin.

**Why this priority**: This is essential for not breaking the existing user base, but it is a one-time migration rather than ongoing functionality, so P2.

**Independent Test**: Can be tested by deploying the multi-tenant build against the existing data, signing in as the migrated league's admin and members, and confirming that (a) all previous members and their setup are intact under a generic league name, (b) no industry-specific or company-specific text remains anywhere in the product, and (c) the migrated league behaves identically to a freshly-created league from this point forward.

**Acceptance Scenarios**:

1. **Given** the existing single-tenant deployment is upgraded to multi-tenant, **When** I sign in as a previously-existing member, **Then** I find myself inside a league that contains all the same members and configuration I had before, with no loss of historical leaderboard or performance data.
2. **Given** the migration has completed, **When** I inspect any UI page, default email template, footer, or static text, **Then** there are no references to "energy trading", any specific company name, or any industry-specific terminology.
3. **Given** the migration has completed, **When** the nominated League Admin opens league settings, **Then** they can rename the league, change the logo, and otherwise manage it exactly as a fresh league admin could.

---

### Edge Cases

- A user is removed by a League Admin while actively viewing the league: their session must lose access on next request without crashing the app.
- A League Admin attempts to add a member whose FPL Manager ID is already a member of a different league: the member should be able to participate in both leagues without their identity collisions corrupting either league's data.
- A Super Admin demotes the only League Admin of a league: the system must either prevent this (requiring a replacement admin first) or warn clearly that the league will be left without an admin.
- A League Admin enters an FPL mini-league ID that they do not own or that is private: the system reports the failure clearly and does not partially import.
- A league is suspended while a gameweek is in progress: members must see the suspension message immediately on next page load, and any cached background data must not bleed through.
- The Super Admin role itself is lost (e.g., the only Super Admin's account is deleted): there must be a documented bootstrap path to re-establish a Super Admin without manual database surgery.
- Two League Admins coexist on the same league and edit settings simultaneously: last-write-wins is acceptable for v1, but no edit must silently corrupt another admin's change to a different field.
- A member belongs to multiple leagues: switching between leagues must be obvious and unambiguous, and per-league data (suggestions, comparisons, ownership) must always reflect the currently-selected league only.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Tenancy & Data Isolation

- **FR-001**: The system MUST support an unlimited number of independent leagues on a single deployment, each with its own members, settings, and data scope.
- **FR-002**: Every data record that is league-specific (members, leaderboards, suggestions, settings, audit events) MUST be associated with exactly one league, and the system MUST never return a record from one league to a user of another league.
- **FR-003**: The system MUST enforce league isolation at the access-control layer (server-side), not only in the user interface; direct attempts to read another league's data via URL or identifier manipulation MUST be denied.
- **FR-004**: The system MUST allow a single human person to be a member of more than one league using a single sign-in identity, with their league context made explicit at all times.

#### Industry & Branding Neutrality

- **FR-005**: The application MUST NOT contain any hard-coded references to a specific industry, sector, company name, or product brand outside of that league's own configurable name and logo.
- **FR-006**: All user-facing copy that previously referred to the energy-trading company or its industry MUST be replaced with generic language that applies equally to any league.
- **FR-007**: Each league MUST be able to configure its own display name and (optionally) its own logo image, and these MUST be the only places league-specific identity appears in the UI.
- **FR-008**: Email and notification templates (deadline reminders, invitations, etc., where present) MUST use the configured league name and platform-generic wording, never industry-specific defaults.

#### Roles & Authorisation

- **FR-009**: The system MUST define three distinct authorisation roles: Member, League Admin, and Super Admin.
- **FR-010**: A Member MUST be able to read their own league's leaderboard, performance, suggestions, and ownership data, but MUST NOT be able to modify league settings, add or remove other members, or access any other league.
- **FR-011**: A League Admin MUST hold all Member capabilities for their league plus the ability to: edit league name and logo, set the FPL mini-league ID, trigger member import, manually add members by FPL Manager ID, rename or set inactive any member of the league, and remove members from the league.
- **FR-012**: A League Admin MUST NOT have any access (read or write) to leagues other than the ones they administer.
- **FR-013**: A Super Admin MUST be able to: list every league on the platform, view membership of any league, create new leagues, suspend or reinstate leagues, delete leagues, promote a Member to League Admin, demote a League Admin to Member, and transfer the League Admin role to a different person.
- **FR-014**: The same person MAY hold multiple roles (e.g., be a regular Member of one league and a League Admin of another), and the system MUST evaluate authorisation per-league rather than globally.
- **FR-015**: The system MUST provide a documented mechanism to bootstrap or recover the Super Admin role without requiring direct data store access.

#### Authentication & Identity

- **FR-016**: The system MUST require users to authenticate before accessing any league data, leaderboard, suggestion, or admin function.
- **FR-017**: A user's identity MUST be stable across leagues, so that a person who is a member of multiple leagues uses one set of credentials and one profile.
- **FR-018**: The system MUST authenticate users via passwordless magic-link email only: a user enters their email address, receives a single-use, time-limited link, and clicks the link to be signed in. The system MUST NOT store user passwords. League Admin invitations MUST be delivered as the recipient's first magic-link, so accepting the invitation and signing in are the same step.
- **FR-019**: When a League Admin invites a person to their league, the system MUST allow that person to accept the invitation and gain access without manual intervention by a Super Admin.

#### League Lifecycle

- **FR-020**: A Super Admin MUST be able to create a new league by providing a league name and the identity (e.g., email) of the initial League Admin.
- **FR-021**: A League Admin MUST be able to complete league setup (mini-league ID, logo, member import) without needing further Super Admin involvement.
- **FR-022**: A suspended league MUST be inaccessible to its members and League Admins (read or write) until reinstated by a Super Admin, but its data MUST be preserved.
- **FR-023**: A deleted league MUST have its league-specific records removed in a documented manner, and members of that league who do not belong to any other league MUST no longer be able to access the platform's league features.

#### Migration of Existing Data

- **FR-024**: The existing single-tenant deployment's organisation, members, and historical data MUST be preserved and presented as the first league on the new platform after upgrade.
- **FR-025**: A previously-existing user with no role assigned MUST be migrated as a Member of the migrated league, and a designated person MUST be migrated as that league's initial League Admin.
- **FR-026**: After migration, no industry-specific or company-specific copy from the previous single-tenant version MUST remain anywhere in the application.

#### Auditability

- **FR-027**: The system MUST record an audit trail of administrative actions (league creation, suspension, deletion, role changes, member additions/removals) including who performed the action, when, and against which league.
- **FR-028**: A Super Admin MUST be able to view the audit trail across all leagues; a League Admin MUST be able to view the audit trail for their own league only.

### Key Entities

- **Platform**: The overall installation. Has zero or more Leagues and zero or more Super Admins. Holds platform-wide settings such as default branding fallback.
- **League**: A self-contained tenant. Has a name, optional logo, an optional FPL mini-league ID, a status (active/suspended), one or more League Admins, and zero or more Members. All FPL tracker functionality (leaderboard, performance, suggestions, ownership) is scoped within a single League.
- **User Account**: A platform-level identity for a real person. Holds authentication credentials and basic profile (display name, email). One account may be linked to multiple League Memberships and may also hold the Super Admin role.
- **League Membership**: The link between a User Account and a League. Holds the role within that League (Member or League Admin), the linked FPL Manager ID, the per-league display name override (if any), an active/inactive flag, and the source of how they joined (mini-league import, manual admin add, or invitation accepted).
- **Super Admin Assignment**: The platform-level role granted to a User Account, independent of any league.
- **Audit Event**: A record of an administrative action — actor, action type, target league, target user (if applicable), timestamp, and details.

All previously-defined FPL-sourced entities (Gameweek, Player, Squad, Fixture, Chip, Suggestion, etc.) remain unchanged, but their queries and computed views MUST always be scoped through a specific League.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new League Admin can complete first-time setup of their league (name, logo, mini-league import) in under 5 minutes without contacting the platform operator.
- **SC-002**: A Super Admin can onboard a brand-new league (create league, assign initial admin, send invitation) in under 2 minutes per league.
- **SC-003**: Zero data leakage between leagues: in a verification run with at least 2 leagues, no league member, no League Admin, and no automated test sees data belonging to a league other than their own except where explicitly authorised (Super Admin).
- **SC-004**: All user-facing UI text, email content, and notification copy passes an automated/manual scan with zero references to "energy trading", the previous company name, or any industry-specific terminology.
- **SC-005**: The existing single-tenant deployment can be upgraded to the multi-tenant build with zero loss of historical leaderboard, performance, and member configuration data, verified by reconciling pre- and post-migration counts.
- **SC-006**: 95% of attempts by a Member or League Admin to access another league's data via direct URL or identifier manipulation are denied with an appropriate not-authorised response, verified by automated test.
- **SC-007**: The platform supports at least 50 concurrent leagues with up to 50 members each (i.e., 2,500 total members) on a single deployment without measurable degradation in page load times for any individual league member compared to the single-tenant baseline.
- **SC-008**: Every administrative action (league creation/suspension/deletion, role change, member add/remove) is recorded in the audit trail and visible to the appropriate admin within 10 seconds of the action being performed.

---

## Assumptions

- The platform continues to use the official Fantasy Premier League public data feed for player, fixture, score, and squad information; this feed is global and not segmented by league, so existing FPL-data caching strategies continue to apply.
- A user's identity is global (one account, one set of credentials) but their authorisation is per-league. A user may be an admin of one league and a regular member of another.
- League Admins onboard members primarily by entering an FPL mini-league ID (auto-import) and secondarily by entering an FPL Manager ID manually, mirroring the existing single-tenant behaviour.
- Member-facing self-registration is out of scope for v1: members join a league only via League Admin-driven invitation or import. Self-service "discover and join a league" is deferred.
- League branding is limited to a name and an optional logo for v1; full theming (colours, custom domains) is out of scope.
- Cross-league analytics, comparisons, or shared leaderboards across leagues are out of scope for v1; every comparison and leaderboard remains scoped to a single league.
- The existing single-tenant deployment's data will be migrated in-place as the first league. No parallel-run of the old single-tenant version is required after the migration.
- Billing, paid plans, and per-league resource limits are out of scope for v1; the platform treats all leagues equally.
- Notification/email volume is low (admin invitations, role changes, magic-link sign-in requests); a transactional email provider is assumed available but is treated as a generic dependency, not a specific vendor choice. Reliable email delivery is a hard prerequisite because magic-link is the only sign-in mechanism — if email delivery fails, the user cannot sign in.
- Magic-link tokens are single-use and time-limited (industry-standard window, e.g., 15 minutes); a user requesting a new link invalidates any previous outstanding link for the same account.
- Sessions established by a successful magic-link sign-in persist for a reasonable duration (industry-standard, e.g., 30 days with sliding expiry) so that members are not asked for their email on every visit; sign-out and admin-initiated revocation are supported.
- Internationalisation/localisation of the new generic copy is out of scope for v1; the platform remains in a single language.
- All previously-defined FPL tracker features (leaderboard, performance, transfers, captain, chip advisor, ownership) remain in scope and continue to work — the multi-league change is a containment/tenancy change, not a rewrite of those features.
