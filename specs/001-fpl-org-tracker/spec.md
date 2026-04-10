# Feature Specification: FPL Organisation Tracker

**Feature Branch**: `001-fpl-org-tracker`
**Created**: 2026-04-02
**Status**: Draft
**Input**: User description: "A web application using React that will allow people in my organisation who play Fantasy Football Premier League together to track their progress each gameweek, get tips, analyse their performance and performance of their players as well as get suggestions for substitutions for the next gameweek, suggestions for captains and using game chips (Bench Boost, Triple Captain, Wildcard, Free Hit)"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gameweek Progress Dashboard (Priority: P1)

An organisation member opens the app and immediately sees how everyone in the group is doing in the current gameweek and overall. They can see each person's gameweek score, total points, league rank, and how many points they are ahead of or behind their closest rivals. This is the "water cooler" view — the first thing people check after a big match night.

**Why this priority**: This is the core social value of the app. Without a clear picture of who is winning this week and overall, the other features lose their context. It delivers immediate, tangible value to every member of the group.

**Independent Test**: Can be tested by linking the organisation's FPL mini-league and verifying that all members' gameweek and total scores are displayed accurately for the current and previous gameweeks.

**Acceptance Scenarios**:

1. **Given** I open the app, **When** the current gameweek is in progress or recently completed, **Then** I see a ranked list of all organisation members showing their gameweek score, total points, rank change, and points-behind-leader for both the current gameweek and the overall season.
2. **Given** the gameweek leaderboard is visible, **When** I select a previous gameweek, **Then** the leaderboard updates to show the standings as they were at the end of that gameweek.
3. **Given** a gameweek has not yet started, **When** I view the dashboard, **Then** I see the previous gameweek's final standings with a clear indication that the next gameweek has not begun.

---

### User Story 2 - Personal Team Performance Analysis (Priority: P2)

A member wants to understand how their team has performed over the season. They can review their own points history gameweek by gameweek, see which of their players contributed the most and least points, identify patterns (e.g., consistently poor bench choices), and compare their score against the organisation average and the overall FPL average for each gameweek.

**Why this priority**: Personal insight drives engagement. Once members can see their dashboard standing, they naturally want to understand *why* they are where they are and what they can improve.

**Independent Test**: Can be tested by selecting any member's team and verifying that their full-season points breakdown, player-level contributions, and comparative benchmarks are displayed correctly.

**Acceptance Scenarios**:

1. **Given** I am viewing my own profile, **When** I navigate to the performance section, **Then** I see a gameweek-by-gameweek breakdown of my total points, bench points left unused, captain points, and how my score compared to the organisation average and global FPL average.
2. **Given** I am on the performance page, **When** I look at my player list for a given gameweek, **Then** I see each player's points contribution, whether they played, and whether they were in my starting XI or on the bench.
3. **Given** the season has at least 4 gameweeks of data, **When** I view my performance trends, **Then** the app highlights my best and worst gameweeks, my most and least reliable players by average points, and any patterns in missed bench points.

---

### User Story 3 - Transfer and Substitution Suggestions (Priority: P3)

Before the next gameweek deadline, a member wants intelligent suggestions for which players to sell and which to bring in. The app analyses upcoming fixtures, player form, availability (injuries/suspensions), and the organisation's existing player ownership to offer ranked transfer recommendations tailored to their current squad.

**Why this priority**: Transfer decisions are the primary weekly skill challenge in FPL. Helping members make better transfers directly improves their enjoyment and competitive standing in the group.

**Independent Test**: Can be tested by selecting a team ahead of a gameweek deadline and verifying that the app generates at least 3 ranked transfer suggestions with clear reasoning based on fixtures and form.

**Acceptance Scenarios**:

1. **Given** the next gameweek deadline has not passed, **When** I open the transfer suggestions page for my team, **Then** I see a ranked list of recommended transfers — each showing the player to sell, the suggested replacement, the reason for the suggestion (e.g., upcoming fixtures, form, injury concern), and the expected points impact.
2. **Given** I have a limited number of free transfers, **When** viewing suggestions, **Then** the app clearly distinguishes between free-transfer recommendations and suggestions that would cost points, ranking free-transfer options first.
3. **Given** multiple players in my squad are injured or suspended, **When** I view suggestions, **Then** all affected players are flagged, and replacement suggestions are prioritised for those positions.

---

### User Story 4 - Captain Recommendation (Priority: P4)

Before each gameweek, a member wants to know who the best captain choice is from their current squad. The app analyses upcoming fixtures, recent form, home/away splits, and historical captain returns to produce a ranked list of captain options from the member's own players, with a clear top pick and reasoning.

**Why this priority**: Captaincy is the single biggest weekly decision in FPL — getting it right or wrong often determines whether a member rises or falls in the standings. This is a high-value, low-effort feature to consume.

**Independent Test**: Can be tested by selecting a team ahead of a gameweek and verifying the app produces a ranked captain shortlist from that squad's players with supporting rationale for each recommendation.

**Acceptance Scenarios**:

1. **Given** the next gameweek deadline has not passed, **When** I open the captain suggestions page, **Then** I see a ranked list of captain options from my current squad, each with a fixture difficulty rating, recent average points, and a plain-English reason for the recommendation.
2. **Given** my top recommended captain has an injury concern or uncertain availability, **When** viewing suggestions, **Then** the app clearly flags this risk and elevates the next safest option with an explanation.
3. **Given** I want to explore differential captain choices (low-ownership picks), **When** I filter by "differential", **Then** the app shows captain options owned by few or none of my organisation rivals, with an assessment of their potential upside.

---

### User Story 5 - Game Chip Advisor (Priority: P5)

A member wants guidance on when to play their remaining chips — Bench Boost, Triple Captain, Wildcard, and Free Hit. The app identifies upcoming gameweeks or Double Gameweek (DGW) periods that are favourable for each chip, explains the reasoning, and shows how many chips each organisation member has already used.

**Why this priority**: Chip timing is one of the most strategically significant decisions across the season. Poorly timed chips are a common source of regret for FPL players. This feature adds a strategic planning dimension beyond weekly decisions.

**Independent Test**: Can be tested by viewing the chip advisor page and verifying it correctly shows each member's chip usage status and surfaces at least one gameweek-specific recommendation for each available chip type.

**Acceptance Scenarios**:

1. **Given** I have unused chips, **When** I open the chip advisor, **Then** I see each of my remaining chips with a recommended gameweek to play it and the reasoning (e.g., "Bench Boost in GW32 — 6 of your players have Double Gameweek fixtures").
2. **Given** a Double Gameweek or Blank Gameweek is confirmed, **When** the chip advisor updates, **Then** affected recommendations are automatically revised to reflect the updated fixture schedule.
3. **Given** I want to compare chip usage across the organisation, **When** I view the chips overview, **Then** I see a table of all members showing which chips they have used and which remain available.

---

### User Story 6 - Rival and Organisation-Wide Player Analysis (Priority: P6)

A member can browse a view of all players currently owned across the organisation's teams, see which players are most popular, who is differentiating with unusual picks, and how specific players have scored for the members who own them. This gives social and strategic context to player decisions.

**Why this priority**: Understanding what rivals own adds a competitive meta-game layer. It helps members identify differentials and understand why rivals are gaining or losing ground.

**Independent Test**: Can be tested by loading the player ownership view and verifying it correctly aggregates and displays ownership counts, total points contributed, and which members own each player.

**Acceptance Scenarios**:

1. **Given** I open the organisation player ownership page, **When** the page loads, **Then** I see a list of all players owned by at least one organisation member, sorted by ownership count, showing how many members own each player and the total points each player has contributed across those teams.
2. **Given** I select a specific player, **When** the detail view opens, **Then** I see that player's gameweek-by-gameweek points, which members own them, and whether they are in each owner's starting XI or on the bench.
3. **Given** I want to find differentials, **When** I filter by "low ownership", **Then** I see players owned by only one or two organisation members alongside their recent form metrics.

---

### Edge Cases

- What happens when the FPL API returns no data for the current gameweek (e.g., international break or postponed fixtures)?
- How does the app handle a member who has just joined the organisation's mini-league mid-season and has fewer gameweeks of history?
- What is displayed for chips already used versus chips that are available?
- How does the app handle Double Gameweek or Blank Gameweek scenarios where fixture counts differ from normal?
- What happens if a member's FPL team is set to private and data cannot be retrieved?
- How does the captain suggestion behave if a member's squad has fewer than 11 fit players available?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST display a real-time leaderboard of all organisation members showing their gameweek score, total points, overall rank, and rank change.
- **FR-002**: Users MUST be able to navigate between any completed gameweek to view historical standings and scores.
- **FR-003**: The application MUST display a personal performance view for each member showing their season-long points history, player contributions, bench points wasted, and captain points per gameweek.
- **FR-004**: The application MUST compare a member's gameweek score against both the organisation average and the global FPL average for each gameweek.
- **FR-005**: The application MUST generate ranked transfer suggestions for each member based on squad composition, player form, upcoming fixture difficulty, and injury/suspension status.
- **FR-006**: Transfer suggestions MUST clearly distinguish between free transfers and point-costing transfers, and MUST include plain-English reasoning for each recommendation.
- **FR-007**: The application MUST generate a ranked captain shortlist for each member derived solely from players in their current squad, including form, fixture difficulty, and a plain-English rationale per recommendation.
- **FR-008**: The captain suggestion MUST flag injury risk or availability uncertainty for any recommended player and surface the next safest option.
- **FR-009**: The application MUST provide a chip advisor that recommends the optimal gameweek to play each unused chip (Bench Boost, Triple Captain, Wildcard, Free Hit) based on fixture schedules, squad composition, and Double/Blank Gameweek events.
- **FR-010**: The application MUST display a chips usage overview showing which chips each organisation member has used and which remain available.
- **FR-011**: The application MUST provide an organisation-wide player ownership view showing ownership counts, total points contributed per player, and which members own each player.
- **FR-012**: Users MUST be able to filter the player ownership view by ownership level to identify differentials.
- **FR-013**: The application MUST flag players with injury or suspension status throughout all relevant views (transfers, captain, ownership).
- **FR-014**: The application MUST support two methods for connecting member FPL data: (1) an admin configures the organisation by entering a shared FPL mini-league ID, which automatically discovers and imports all members of that league; and (2) individual members can also manually add themselves by entering their own FPL Manager ID, enabling participation without being part of the configured mini-league.
- **FR-015**: The application MUST automatically refresh data at regular intervals during an active gameweek to reflect live scores.

### Key Entities

- **Organisation**: The group of colleagues sharing this application; linked to a shared FPL mini-league.
- **Member**: An individual within the organisation who has an FPL team; identified by their FPL Manager ID and associated with a display name.
- **Gameweek**: A round of Premier League fixtures in the FPL calendar; has a start date, deadline, status (upcoming/active/completed), and associated scores for each member.
- **Squad**: A member's 15-player selection for a given gameweek, including the starting XI, bench order, captain, and vice-captain.
- **Player**: A Premier League footballer with attributes including position, team, price, form, total points, and availability status (fit/injured/suspended/doubtful).
- **Fixture**: A scheduled Premier League match with a difficulty rating, home/away teams, and gameweek assignment; may be doubled (DGW) or blanked (BGW) for some teams.
- **Chip**: A one-time-use game modifier available to each member (Bench Boost, Triple Captain, Wildcard, Free Hit); has a used/available status and the gameweek it was played.
- **Suggestion**: A system-generated recommendation (transfer, captain, chip timing) linked to a member and gameweek, with a ranking, reasoning, and expected impact.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All organisation members' gameweek scores and standings are visible within 5 seconds of opening the application.
- **SC-002**: Transfer and captain suggestions are generated and displayed within 10 seconds of navigating to the relevant page.
- **SC-003**: At least 3 ranked transfer suggestions are presented to each member ahead of every gameweek deadline, covering all positions where improvements are identified.
- **SC-004**: At least 3 captain options are presented per member per gameweek, each with clear supporting rationale.
- **SC-005**: Chip advisor recommendations are updated automatically within 24 hours of Double Gameweek or Blank Gameweek fixture changes being published.
- **SC-006**: Organisation members can review any gameweek's performance data from the start of the current season without missing historical records.
- **SC-007**: All injury and suspension flags are accurate and up to date, reflecting the latest FPL data at the time of viewing.
- **SC-008**: At least 80% of organisation members actively use the application at least once per gameweek during the first 4 gameweeks after launch.

---

## Assumptions

- The official Fantasy Premier League public data feed is used as the data source for all player, fixture, score, and squad information.
- The organisation has an existing FPL mini-league that all members participate in; this mini-league ID is the primary linking mechanism for the group.
- The application is intended for internal organisational use only and does not need to support public registration or discovery.
- All organisation members already have active FPL accounts and are members of the shared mini-league before using this app.
- The number of members in the organisation group is small to medium (2–50 people); large-scale multi-league support is out of scope for v1.
- Suggestions (transfers, captains, chips) are generated algorithmically using available FPL data (fixtures, form, ownership) rather than sourced from a third-party tips service or AI model.
- Mobile responsiveness is a goal but a dedicated mobile app is out of scope; the React web application must function well on mobile browsers.
- Data from previous seasons is out of scope; the application covers the current FPL season only.
- The application does not allow members to make actual FPL transfers or changes through the app; it is read-only and advisory.
- Notification/email features for deadline reminders or score alerts are out of scope for v1.
