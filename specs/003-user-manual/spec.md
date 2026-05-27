# Feature Specification: In-App User Manual

**Feature Branch**: `003-user-manual`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "I would like you to write a user documentation/manual that will be accessible from within the application. I would like it to contain a comprehensive documentation on how to use the system as an ordynary user and a league admin. I would like it to be enhanced by visuals as well."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Member learns the app from inside it (Priority: P1)

A member who has just signed in for the first time opens an entry point labelled "Help" or "User Manual" from inside the app, lands on a welcome page that orients them to the platform, and browses to topic pages that explain each member-facing feature (Standings, Live Points, Transfers, Form Table, Bench Waste, Captain History, Differentials, Wall of Shame, etc.). Every topic is supported by at least one annotated screenshot of the actual screen so the reader sees what they will see in the live app.

**Why this priority**: This is the core value the user asked for. Without it, the feature does not exist. Onboarding new members is the most expensive moment in the lifecycle, and self-serve documentation is the highest-leverage way to reduce that cost. The other priorities below are amplifications of this one.

**Independent Test**: Sign in as a brand-new member who has never used the platform. Open the manual from the sidebar. Verify that they can locate explanations for the five most-visited member surfaces (Standings, Live Points, Transfers, Bench Waste, Differentials) and that each topic page shows at least one screenshot reflecting the current UI. Verify that the member can complete a first viewing of "what does this app do and what is on each page" within five minutes without leaving the manual.

**Acceptance Scenarios**:

1. **Given** a signed-in member on any league page, **When** they click the "Help" / "User Manual" entry in the sidebar, **Then** the manual opens to a welcome / table-of-contents page.
2. **Given** a member on the manual's welcome page, **When** they navigate to the "Standings" topic, **Then** they see prose describing what the page shows and at least one annotated screenshot of the Standings page.
3. **Given** a member reading a topic, **When** they click "Back to manual" or close the manual, **Then** they return to the page they were on before opening the manual.
4. **Given** a member on a feature page (e.g. Captain What-If), **When** they click a contextual "Help on this page" link, **Then** the manual opens directly to the relevant topic, not the welcome page.

---

### User Story 2 — League Admin learns admin tasks (Priority: P1)

A league admin who has just been promoted opens the manual and finds a dedicated "League Admin" section that walks them through every administrative task: configuring league settings (name, logo, mini-league ID, digest prompt), syncing members from the FPL mini-league, inviting members by email, adjusting member metadata, sending the weekly email digest, reading the audit log, and (where relevant) handling a suspended-league state. Each task is illustrated with the actual admin screens captured as annotated screenshots showing where to click.

**Why this priority**: League Admins are the small but high-leverage group whose mistakes affect every member of their league. The cost of an admin getting stuck — sending a malformed invitation, missing the digest, misconfiguring the mini-league ID — propagates to everyone. Co-equal P1 with Story 1 because admin self-service determines whether the platform scales beyond hand-holding.

**Independent Test**: Sign in as a member who has been promoted to League Admin in only one league. Open the manual, navigate to "League Admin", and complete the following tasks using only the manual as guidance: (a) update the league name, (b) invite a test member by email, (c) trigger the GW digest manually, (d) review the audit log. Verify that each task page contains at least one annotated screenshot of the relevant admin screen and that the steps remain accurate against the live app.

**Acceptance Scenarios**:

1. **Given** an admin opens the manual, **When** they navigate the table of contents, **Then** they see a clearly labelled "League Admin" section separate from the member section.
2. **Given** an admin reading the "Invite a member" topic, **When** they follow the documented steps in the actual app, **Then** the documented sequence matches the live UI and they successfully send the invitation.
3. **Given** an admin reading the "Send the weekly digest" topic, **When** they reach the section about required SMTP configuration, **Then** the manual lists the environment variables and the visible "Digest configured" banner on the admin page (with a screenshot).
4. **Given** a regular member who is not an admin, **When** they navigate to the admin section of the manual, **Then** the section is still readable (so they know what their admin does) but is clearly labelled "For League Admins".

---

### User Story 3 — User finds an answer via search (Priority: P2)

A user (either member or admin) knows what they want to learn — e.g. "captain what-if", "deduction", "wall of shame" — types it into a search field inside the manual, and is taken to (or shown a list of) the relevant topic. They reach the answer in seconds rather than browsing the table of contents.

**Why this priority**: Search is what turns a manual from "a thing nobody reads" into "a thing users actually consult". Without it, the manual is only useful to people willing to scan a sidebar of topics. With it, the manual works on questions, not on taxonomy. Demoted to P2 because the manual is still useful with only browse navigation; search is an amplifier.

**Independent Test**: Sign in, open the manual, type three different queries that map cleanly to existing topics ("deduction", "magic link", "regret"), and verify each query surfaces the correct topic in under one second of typing. Verify that a query that maps to nothing returns a helpful "no results — try these topics" message instead of an empty screen.

**Acceptance Scenarios**:

1. **Given** a user with the manual open, **When** they type a feature name into the search field, **Then** matching topics appear ranked by relevance as they type.
2. **Given** a user views a search result, **When** they click it, **Then** they are taken to that topic with the matched term highlighted.
3. **Given** a query that returns nothing, **When** the user submits it, **Then** they see a "no matches" message with a list of the most popular topics as a fallback.

---

### User Story 4 — Contextual help from feature pages (Priority: P2)

A user is on a feature page (e.g. Bench Waste) and is confused by what they are looking at. A small, non-intrusive help icon — a "?" or similar — sits on the page; clicking it opens the manual directly to the topic that explains that page. The user does not have to discover the manual exists, navigate to it from the sidebar, or guess which topic to read.

**Why this priority**: Documentation that lives "somewhere else" is documentation that does not get read. Pulling help into the moment-of-need is the single biggest predictor of whether docs reduce support load. P2 because Story 1 has to be in place first (there must be content to deep-link to), but this is what makes the content actually consumed.

**Independent Test**: Open every member-facing feature page in turn (Standings, Live Points, Transfers, Form, Season Stats, Bench Waste, Captain History, H2H, Regret, Agony, Luck, Captain What-If, Wall of Shame, Fixtures, Ownership, Differentials, Injuries). On each page, locate the contextual help affordance and click it. Verify that it opens the manual deep-linked to that page's topic, not to the table of contents.

**Acceptance Scenarios**:

1. **Given** a user on a feature page, **When** they look at the page header, **Then** they see a clearly identifiable help affordance ("?" icon or similar) that is keyboard-accessible.
2. **Given** a user clicks the contextual help affordance, **When** the manual opens, **Then** it is scrolled to the topic for that specific page.
3. **Given** a user closes the manual, **When** they return to the underlying app, **Then** they are on the same page and state they came from.

---

### User Story 5 — Manual stays trustworthy as the app evolves (Priority: P3)

Each release that ships a UI change also ships the corresponding documentation update — new feature pages added, screenshots refreshed when the layout changes, removed features removed from the manual. A user who reads the manual today and an admin who reads it three months later both see content that matches the live app.

**Why this priority**: A stale manual is a liability — it actively misleads users and erodes trust. P3 because the content of Story 1 + 2 has to exist first; staleness only becomes a problem after the first release ships. Once those exist, this becomes an ongoing operational discipline more than a feature.

**Independent Test**: After any UI change in a release, open the manual section for the changed page and verify the prose and screenshots reflect the new UI. As a release gate, no PR that changes a member-facing or admin-facing screen merges without the corresponding manual update.

**Acceptance Scenarios**:

1. **Given** a UI change is shipping in a release, **When** the PR is reviewed, **Then** the reviewer can see the matching manual update in the same change (or a linked change).
2. **Given** a user opens a topic page, **When** they read it, **Then** the screenshots reflect the live UI within one release cycle.
3. **Given** a feature is removed, **When** the removal ships, **Then** the manual no longer references that feature.

---

### Edge Cases

- **Suspended league**: when a member opens the manual from a suspended league, the manual still loads (it is universal content, not league-scoped) and renders normally. The manual itself does not refer to that league's state.
- **Not signed in**: opening a deep link to a manual topic while signed out follows the existing sign-in redirect, then returns the user to the manual page after authentication. The manual is not public — it is gated behind sign-in like the rest of the app.
- **Mobile / small viewport**: the manual is usable on phone-width viewports. Screenshots scale or are presented in a tappable lightbox; the table of contents collapses into a drawer.
- **Member views admin section**: members can read the admin section out of curiosity. The section is labelled "For League Admins" and does not pretend to be member content. Buttons / settings the member does not have access to are still described.
- **Search query matches no topic**: a "no matches" message surfaces with the most popular topics as a fallback so the user is not left at a dead end.
- **Image fails to load**: a fallback shows the image's caption / alt text so the prose still makes sense without the visual.
- **Print**: a user prints a manual page from the browser. The result is legible — the page header, navigation chrome, and active-state indicators do not bleed into the printed output.
- **Screenshot drift**: a screenshot in the manual no longer matches the live UI because a release shipped without updating it. The manual is still readable, but the reader's trust in it erodes. The release process (see Story 5) is what prevents this; an individually stale screenshot is a bug to be fixed in the next release.
- **Future Super Admin documentation**: Super Admin operations (platform-wide league management, cross-league audit) are explicitly out of scope for this feature. The manual's table of contents does not list them, and Super Admins continue to operate against the `/platform` console without dedicated documentation in v1.

## Requirements *(mandatory)*

### Functional Requirements

**Access & Navigation**
- **FR-001**: System MUST provide a top-level entry point to the manual that is visible from every signed-in surface, located in a stable position (sidebar or persistent navigation chrome).
- **FR-002**: System MUST allow any signed-in user — Member or League Admin — to open the manual without leaving the app and without losing their place.
- **FR-003**: System MUST provide a contextual "Help on this page" affordance on each major feature page that deep-links to the manual topic for that page.
- **FR-004**: System MUST allow the user to return to the page they were on before opening the manual via a "Back" affordance or browser back navigation.

**Content — Member section**
- **FR-005**: Manual MUST contain a topic for each member-facing feature page in the app (Standings, Live Points, Transfers, Form Table, Season Stats, Bench Waste, Captain History, H2H, Regret, Agony, Luck, Captain What-If, Wall of Shame, Fixtures, Ownership, Differentials, Injuries — at minimum the set present at release time).
- **FR-006**: Manual MUST cover account-level topics: signing in via magic-link, switching between leagues, accepting an invitation, and what to do if a magic-link email does not arrive.
- **FR-007**: Each member-section topic MUST include at least one annotated screenshot or diagram illustrating the page or interaction being described.

**Content — League Admin section**
- **FR-008**: Manual MUST contain a dedicated, clearly labelled "League Admin" section.
- **FR-009**: Admin section MUST cover at minimum: configuring league settings (name, slug, logo, mini-league ID, digest prompt), syncing members from the FPL mini-league, inviting members by email, editing or removing members, sending the weekly digest, reviewing the audit log, and the behaviour of a suspended league.
- **FR-010**: Each admin topic MUST include at least one annotated screenshot showing the relevant admin screen with the controls referenced in the prose visually called out.

**Discoverability**
- **FR-011**: Manual MUST provide a table of contents that organises topics into clearly named groups so a user can locate any topic in three clicks or fewer from the welcome page.
- **FR-012**: Manual MUST provide a free-text search field that returns matching topics ranked by relevance as the user types.
- **FR-013**: Manual MUST provide a "no results" state that suggests popular topics when a search returns nothing.

**Visual treatment**
- **FR-014**: Visuals MUST be annotated where annotation aids comprehension (callout arrows, highlighted regions, captions) — a raw, unannotated screenshot is acceptable only where the page is self-explanatory.
- **FR-015**: Visuals MUST scale legibly across desktop, tablet, and mobile-phone viewports, with a tappable enlarged view on small viewports.
- **FR-016**: Every visual MUST have descriptive alternative text so the prose still makes sense if the image fails to load or the user is using assistive technology.

**Role-awareness**
- **FR-017**: Manual MUST clearly label which sections are intended for which role; admin-only topics MUST be tagged "For League Admins".
- **FR-018**: Members MUST be able to read admin-section topics if they choose to (so they understand what their admin does), but the labelling MUST make role context obvious.

**Trust & maintenance**
- **FR-019**: Manual content MUST be updated in the same release as any UI change to the screens it describes; the release process MUST treat documentation as a release artefact, not a follow-up.
- **FR-020**: Manual MUST display a "Last updated" timestamp per topic so a reader can judge how fresh the content is.

**Accessibility**
- **FR-021**: Manual MUST be navigable using keyboard alone (table of contents, search field, in-page links, contextual help affordances).
- **FR-022**: Manual MUST conform to the same accessibility baseline as the rest of the app (sufficient colour contrast, focus indicators, skip-to-content where appropriate, semantic headings).

**Out of scope for v1 (documented for completeness)**
- Video walkthroughs.
- Interactive tutorials / in-product tours.
- Localisation into languages other than English.
- Editable manual content (no in-app editing of documentation).
- Super Admin / platform-operator documentation.
- Public, unauthenticated access to the manual.

### Key Entities

- **Topic** — A self-contained article in the manual covering one feature, screen, or task. Has a title, a primary audience tag (Member / League Admin / Either), a body of prose and visuals, a "last updated" date, and a stable identifier used by contextual deep-links.
- **Section** — A named grouping of topics in the table of contents (e.g. "Getting Started", "Reading the App", "League Admin"). Each section orders its topics so the manual reads sequentially when consumed top-to-bottom.
- **Visual** — An image (screenshot, diagram, or annotated screenshot) embedded in a topic. Has alternative text, an optional caption, and a position within the topic body.
- **Search Index** — A representation of topic titles and bodies queryable by the in-manual search. Refreshed when topics change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can open the manual from anywhere in the app in three clicks or fewer.
- **SC-002**: A first-time member can locate the topic explaining any of the ten most-visited member surfaces within sixty seconds of opening the manual.
- **SC-003**: A newly promoted League Admin can successfully complete the three most common admin tasks — invite a member, update league settings, send the weekly digest — using only the manual as guidance, without contacting a support channel.
- **SC-004**: 100% of member-facing feature pages and 100% of admin task pages have at least one annotated visual in their corresponding manual topic.
- **SC-005**: 100% of member-facing and admin-facing pages in the live app have a contextual "Help on this page" affordance that deep-links to the correct manual topic.
- **SC-006**: 90% of free-text searches that map to an existing topic surface that topic in the top three results.
- **SC-007**: After any release that ships a UI change, the matching manual section's "Last updated" timestamp is no older than that release.
- **SC-008**: Support requests categorised as "how do I…" drop by at least 50% in the first three release cycles after the manual ships, measured against the equivalent baseline period.
- **SC-009**: The manual is fully usable on a mobile-phone-width viewport (no horizontal scrolling, all screenshots legible after a single tap to enlarge).

## Assumptions

- **Scope is Member + League Admin only.** Super Admin operations (platform-wide league management, suspending leagues, cross-league audit) are explicitly out of scope for this feature, consistent with the user's request which named only those two roles.
- **English-only.** No localisation in v1.
- **Authenticated access only.** The manual is gated by the existing sign-in flow; it is not a public marketing site. Unauthenticated visits redirect to sign-in like the rest of the app.
- **Visuals are static images.** Screenshots and diagrams are captured manually and stored alongside the manual's content. Visuals refresh with each release that changes the underlying UI; there is no automated screenshot pipeline in v1.
- **Authoring lives in the same codebase.** The manual's content is source-controlled with the rest of the app and ships through the same release process. There is no separate content management system.
- **Search is text-based, in-manual only.** Searching the manual does not search anything else (audit events, members, FPL players); it searches manual topics. Search results are scoped to topics the current user is allowed to read.
- **Reasonable footprint.** The manual is text-and-image-heavy but kept under a few megabytes per topic so it loads in under two seconds on a typical broadband connection.
- **Existing role model is reused.** No new permissions, no new auth pathways. The manual reads the existing user's role(s) to decide which sections to badge as their own.
- **Existing UI shell (sidebar, navigation chrome, accessibility primitives) is reused.** The manual lives inside the existing app shell and inherits its layout, theme, and accessibility behaviours.
- **The manual covers the feature set as of the release in which this feature ships.** Topics for features that ship later are added to the manual in those later releases, not in this one.

## Dependencies

- The existing authenticated app shell and sidebar — the manual's entry point and surrounding navigation depend on them.
- The existing role and membership model — the manual's "For League Admins" labelling and any role-aware behaviour depend on them.
- The existing release process — Story 5 / SC-007 depend on the team treating documentation as a release artefact (a PR-time discipline, not a separate workflow).
- An identified content owner for the initial write-up — the manual is comprehensive only if someone commits the time to write it. This is a process dependency rather than a technical one, but it is real and blocks SC-002 / SC-003.
