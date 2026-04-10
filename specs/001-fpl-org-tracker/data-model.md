# Data Model: FPL Organisation Tracker

**Phase**: 1
**Branch**: `001-fpl-org-tracker`
**Date**: 2026-04-02

---

## Overview

This data model describes the entities managed by the application. Data is sourced primarily from the FPL API (read-only). The application persists only the minimal local state required: organisation configuration (mini-league ID) and member registrations that were added manually (by Manager ID). All other data is derived from the FPL API at runtime and cached server-side.

---

## Entities

### Organisation

Represents the group of colleagues using the application. There is one Organisation per deployment of the app.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated identifier (e.g., UUID) |
| `name` | string | Display name of the organisation group |
| `miniLeagueId` | number \| null | FPL mini-league ID used to auto-import members; null if not configured |
| `createdAt` | datetime | When the organisation was first configured |

**Constraints**:
- `miniLeagueId` is optional; organisation can be configured with manual members only.
- Only one organisation record exists per app instance.

---

### Member

Represents an individual in the organisation who has an FPL team.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated identifier |
| `managerId` | number | FPL Manager ID (unique identifier from FPL API) |
| `displayName` | string | The member's name as shown in the app (defaults to their FPL team manager name) |
| `teamName` | string | Their FPL team name (pulled from FPL API) |
| `source` | enum: `league` \| `manual` | How this member was added: auto-discovered via mini-league or manually entered |
| `isActive` | boolean | Whether the member is included in organisation views |
| `addedAt` | datetime | When the member was added to the organisation |

**Constraints**:
- `managerId` must be unique within the organisation.
- `displayName` can be overridden locally by admin; defaults to FPL manager name.
- Members with `source: league` are re-synced when the mini-league is refreshed.
- If a member's FPL team is private, `isActive` may be set false with an error state recorded.

---

### Gameweek (FPL-sourced, not persisted locally)

Represents a round of Premier League fixtures in the FPL calendar. Sourced from `bootstrap-static/events[]`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Gameweek number (1–38) |
| `name` | string | Display name (e.g., "Gameweek 28") |
| `deadlineTime` | datetime | Submission deadline for squad changes |
| `isFinished` | boolean | Whether all fixtures in this GW are completed |
| `isCurrent` | boolean | Whether this is the currently active gameweek |
| `isNext` | boolean | Whether this is the next upcoming gameweek |
| `topElementInfo` | object | FPL's highest-scoring player for this GW |
| `averageEntryScore` | number | Global FPL average score for this GW |
| `highestScore` | number | Highest individual score in this GW globally |

**State Transitions**:
```
upcoming → active (when deadline passes and first fixture kicks off)
active → finished (when all GW fixtures are completed)
```

---

### MemberGameweekResult (FPL-sourced, cached)

The score and performance summary for a specific member in a specific gameweek. Derived from `entry/{managerId}/history/` and `leagues-classic/{leagueId}/standings/`.

| Field | Type | Description |
|-------|------|-------------|
| `managerId` | number | Foreign key to Member |
| `gameweekId` | number | Foreign key to Gameweek |
| `points` | number | Raw points scored in this GW |
| `pointsOnBench` | number | Points left on bench (missed points) |
| `totalPoints` | number | Cumulative season total including this GW |
| `overallRank` | number | Global FPL rank after this GW |
| `bankValue` | number | Available transfer budget (tenths of £) |
| `teamValue` | number | Total squad value (tenths of £) |
| `transfersMade` | number | Number of transfers made before this GW |
| `transfersCost` | number | Points deducted for excess transfers |
| `chipUsed` | enum \| null | Which chip was played: `bboost`, `3xc`, `wildcard`, `freehit`, or null |

---

### Squad (FPL-sourced, cached)

The 15-player selection a member made for a specific gameweek. Sourced from `entry/{managerId}/event/{gw}/picks/`.

| Field | Type | Description |
|-------|------|-------------|
| `managerId` | number | Foreign key to Member |
| `gameweekId` | number | Foreign key to Gameweek |
| `picks` | Pick[] | Array of 15 picks (see Pick below) |
| `activeChip` | string \| null | Chip active for this gameweek |

**Pick** (element within Squad.picks):

| Field | Type | Description |
|-------|------|-------------|
| `playerId` | number | FPL element ID |
| `position` | number | Squad position (1–15; 1–11 = starting XI) |
| `isCaptain` | boolean | True if this player is captain |
| `isViceCaptain` | boolean | True if this player is vice-captain |
| `multiplier` | number | 1 = normal, 2 = captain, 3 = triple captain, 0 = not playing |

---

### Player (FPL-sourced, cached from bootstrap-static)

A Premier League footballer available in FPL. Sourced from `bootstrap-static/elements[]`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | FPL element ID |
| `firstName` | string | Player's first name |
| `lastName` | string | Player's second name (surname) |
| `webName` | string | Display name used by FPL (usually surname) |
| `teamId` | number | Foreign key to Team |
| `elementType` | number | Position: 1=GK, 2=DEF, 3=MID, 4=FWD |
| `nowCost` | number | Current price in tenths of £ (e.g., 130 = £13.0m) |
| `totalPoints` | number | Cumulative season points |
| `form` | string | Rolling average points over recent gameweeks |
| `selectedByPercent` | string | Global FPL ownership percentage |
| `ictIndex` | string | Influence, Creativity, Threat composite score |
| `minutes` | number | Total minutes played this season |
| `goalsScored` | number | Season goals |
| `assists` | number | Season assists |
| `cleanSheets` | number | Season clean sheets |
| `status` | enum | `a`=available, `d`=doubtful, `i`=injured, `s`=suspended, `u`=unavailable |
| `news` | string | Injury/availability news text |
| `chanceOfPlayingNextRound` | number \| null | 0–100 percentage chance of playing |

---

### Team (FPL-sourced, cached from bootstrap-static)

A Premier League club. Sourced from `bootstrap-static/teams[]`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | FPL team ID |
| `name` | string | Full club name |
| `shortName` | string | 3-letter abbreviation (e.g., ARS, LIV) |
| `strengthOverallHome` | number | Relative home strength rating |
| `strengthOverallAway` | number | Relative away strength rating |
| `strengthAttackHome` | number | Attack strength at home |
| `strengthDefenceAway` | number | Defence strength away |

---

### Fixture (FPL-sourced, cached)

A scheduled or completed Premier League match. Sourced from `fixtures/`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | FPL fixture ID |
| `event` | number \| null | Gameweek number; null if the fixture is not yet scheduled to a GW (common during BGWs) |
| `teamH` | number | Home team ID |
| `teamA` | number | Away team ID |
| `teamHDifficulty` | number | FDR for the home team (1=easy, 5=hard) |
| `teamADifficulty` | number | FDR for the away team |
| `kickoffTime` | datetime \| null | Scheduled kickoff |
| `finished` | boolean | Whether the match is complete |
| `teamHScore` | number \| null | Home team goals |
| `teamAScore` | number \| null | Away team goals |

**Derived States**:
- **DGW**: A team appears in 2 fixture records with the same `event` value.
- **BGW**: A team has no fixture records for a given `event` value.

---

### Chip (derived from Member + MemberGameweekResult)

Tracks which chips a member has used and when. Derived from `entry/{managerId}/history/chips[]`.

| Field | Type | Description |
|-------|------|-------------|
| `managerId` | number | Foreign key to Member |
| `chipName` | enum | `bboost` (Bench Boost), `3xc` (Triple Captain), `wildcard`, `freehit` |
| `time` | datetime | When the chip was activated |
| `event` | number | Gameweek the chip was played in |

**Constraints**:
- Each chip can be used at most once per season (Wildcard can be used twice: once in each half of the season).
- Chips not found in history are considered available.

---

### Suggestion (application-generated, not persisted)

A recommendation generated by the suggestion engine. Computed on-demand and not stored — recalculated on each request.

| Field | Type | Description |
|-------|------|-------------|
| `managerId` | number | The member this suggestion is for |
| `gameweekId` | number | The target gameweek |
| `type` | enum | `transfer`, `captain`, `chip` |
| `rank` | number | Ranking within the suggestion set (1 = highest priority) |
| `playerOut` | number \| null | Player ID to sell (transfer suggestions only) |
| `playerIn` | number \| null | Player ID to buy (transfer suggestions only) |
| `targetPlayerId` | number \| null | Recommended player (captain suggestions) |
| `chipName` | string \| null | Chip to play (chip suggestions only) |
| `targetGameweek` | number \| null | Recommended GW for chip (chip suggestions) |
| `score` | number | Algorithm score used to rank this suggestion |
| `reasoning` | string | Plain-English explanation of the recommendation |
| `isDifferential` | boolean | True if this is a low-ownership pick vs organisation |

---

## Entity Relationships

```
Organisation
  └─ has many Members

Member
  ├─ has many MemberGameweekResults (one per completed GW)
  ├─ has many Squads (one per GW)
  └─ has many Chips (used chips only)

Gameweek
  ├─ has many MemberGameweekResults
  └─ has many Fixtures

Squad
  └─ has many Picks → references Players

Player
  └─ belongs to Team

Fixture
  ├─ home Team
  └─ away Team

Suggestion (computed, no stored relationships)
  ├─ for Member
  ├─ references Player (playerOut, playerIn, or targetPlayerId)
  └─ references Gameweek
```

---

## Local Persistence Scope

Only two entity types require local persistence (e.g., in a database or config file):

1. **Organisation** — one record per deployment (mini-league ID, org name)
2. **Member** — member registrations, especially manually-added members (source: `manual`)

All other entities are fetched from the FPL API and cached at the server layer. This minimises the persistence footprint and avoids data sync conflicts with the authoritative FPL source.

### Recommended Storage

For an internal tool with 2–50 members, a lightweight embedded database (SQLite via Prisma, or a JSON file store) is sufficient. No external database service is required for v1.
