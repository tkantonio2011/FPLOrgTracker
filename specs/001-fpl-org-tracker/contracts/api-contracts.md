# API Contracts: FPL Organisation Tracker

**Phase**: 1
**Branch**: `001-fpl-org-tracker`
**Date**: 2026-04-02

These are the internal REST API contracts exposed by the Next.js backend (Route Handlers under `/api/*`) to the React frontend. All routes are server-side; they proxy and aggregate FPL API data, applying caching and the suggestion engine.

---

## Conventions

- Base path: `/api`
- All responses: `Content-Type: application/json`
- Errors: `{ "error": "message", "code": "ERROR_CODE" }`
- Dates: ISO 8601 strings
- Player costs: returned as integers (tenths of £); frontend divides by 10 for display
- Gameweek numbers: 1-indexed integers

---

## Organisation & Members

### `GET /api/org`

Returns the organisation configuration and member list.

**Response**:
```json
{
  "id": "uuid",
  "name": "Acme FPL League",
  "miniLeagueId": 12345,
  "members": [
    {
      "id": "uuid",
      "managerId": 67890,
      "displayName": "Tom K",
      "teamName": "Tom's Tactics FC",
      "source": "league",
      "isActive": true
    }
  ]
}
```

---

### `POST /api/org/setup`

Initial organisation setup. Sets the org name and optional mini-league ID.

**Request body**:
```json
{
  "name": "Acme FPL League",
  "miniLeagueId": 12345
}
```

**Response**: `201 Created` with the organisation object (same shape as `GET /api/org`).

---

### `POST /api/org/sync`

Triggers a sync of members from the configured mini-league. Fetches league standings, adds new members, marks removed members as inactive.

**Response**:
```json
{
  "added": 3,
  "removed": 0,
  "total": 8
}
```

---

### `POST /api/members`

Manually adds a member by FPL Manager ID.

**Request body**:
```json
{
  "managerId": 67890
}
```

**Response**: `201 Created` with the new member object.

**Error**: `409 Conflict` if `managerId` already exists.

---

### `DELETE /api/members/{managerId}`

Marks a manually-added member as inactive (soft delete).

**Response**: `204 No Content`

---

## Gameweek & Standings

### `GET /api/gameweeks`

Returns all gameweek metadata for the current season.

**Response**:
```json
{
  "currentGameweek": 28,
  "gameweeks": [
    {
      "id": 28,
      "name": "Gameweek 28",
      "deadlineTime": "2026-03-14T11:00:00Z",
      "isFinished": false,
      "isCurrent": true,
      "averageEntryScore": 52,
      "highestScore": 118
    }
  ]
}
```

**Cache**: `revalidate: 3600`

---

### `GET /api/standings?gw={gameweekId}`

Returns the organisation leaderboard for a specific gameweek (defaults to current GW if omitted).

**Response**:
```json
{
  "gameweekId": 28,
  "standings": [
    {
      "rank": 1,
      "rankChange": 2,
      "managerId": 67890,
      "displayName": "Tom K",
      "teamName": "Tom's Tactics FC",
      "gameweekPoints": 78,
      "totalPoints": 1420,
      "overallRank": 45230,
      "chipUsed": null,
      "pointsBehindLeader": 0
    }
  ],
  "orgAverageGwPoints": 54,
  "globalAverageGwPoints": 52
}
```

**Cache**: `revalidate: 60` (1 minute during active GW), `revalidate: 3600` otherwise

---

## Member Performance

### `GET /api/members/{managerId}/performance`

Returns the full season performance history for one member.

**Response**:
```json
{
  "managerId": 67890,
  "displayName": "Tom K",
  "teamName": "Tom's Tactics FC",
  "history": [
    {
      "gameweekId": 1,
      "points": 62,
      "totalPoints": 62,
      "pointsOnBench": 10,
      "overallRank": 120000,
      "transfersMade": 0,
      "transfersCost": 0,
      "chipUsed": null
    }
  ],
  "seasonSummary": {
    "totalPoints": 1420,
    "bestGameweek": { "id": 14, "points": 112 },
    "worstGameweek": { "id": 5, "points": 28 },
    "totalBenchPoints": 180,
    "totalTransferCost": 8
  }
}
```

**Cache**: `revalidate: 3600`

---

### `GET /api/members/{managerId}/squad?gw={gameweekId}`

Returns the squad picks for a member for a specific gameweek.

**Response**:
```json
{
  "managerId": 67890,
  "gameweekId": 28,
  "activeChip": null,
  "picks": [
    {
      "position": 1,
      "playerId": 283,
      "webName": "Salah",
      "teamShortName": "LIV",
      "elementType": 3,
      "isStarting": true,
      "isCaptain": true,
      "isViceCaptain": false,
      "multiplier": 2,
      "points": 16,
      "status": "a",
      "news": ""
    }
  ]
}
```

**Cache**: `revalidate: 3600` for completed GWs; `revalidate: 120` for active GW

---

## Players & Fixtures

### `GET /api/players?position={type}&minForm={n}&maxCost={n}&status={status}`

Returns filtered player list. All query params optional.

**Query params**:
- `position`: `1` (GK), `2` (DEF), `3` (MID), `4` (FWD)
- `minForm`: minimum form value (float string)
- `maxCost`: maximum price in tenths of £
- `status`: `a` (available only)

**Response**:
```json
{
  "players": [
    {
      "id": 283,
      "webName": "Salah",
      "teamId": 14,
      "teamShortName": "LIV",
      "elementType": 3,
      "nowCost": 130,
      "totalPoints": 198,
      "form": "9.2",
      "selectedByPercent": "68.3",
      "ictIndex": "312.1",
      "status": "a",
      "news": "",
      "chanceOfPlayingNextRound": null,
      "upcomingFixtures": [
        {
          "gameweekId": 29,
          "opponent": "EVE",
          "isHome": true,
          "difficulty": 2
        }
      ]
    }
  ]
}
```

**Cache**: `revalidate: 3600`

---

### `GET /api/fixtures?gw={gameweekId}`

Returns fixture list, optionally filtered to a gameweek.

**Response**:
```json
{
  "fixtures": [
    {
      "id": 200,
      "gameweekId": 28,
      "teamH": { "id": 14, "shortName": "LIV" },
      "teamA": { "id": 1, "shortName": "ARS" },
      "teamHDifficulty": 3,
      "teamADifficulty": 3,
      "kickoffTime": "2026-03-15T15:00:00Z",
      "finished": false,
      "isDgwForTeamH": false,
      "isDgwForTeamA": false
    }
  ]
}
```

**Cache**: `revalidate: 86400`

---

## Organisation Player Ownership

### `GET /api/ownership?gw={gameweekId}`

Returns player ownership summary across all active organisation members.

**Response**:
```json
{
  "gameweekId": 28,
  "players": [
    {
      "playerId": 283,
      "webName": "Salah",
      "teamShortName": "LIV",
      "elementType": 3,
      "ownerCount": 6,
      "ownerDisplayNames": ["Tom K", "Alice B", "Dave T"],
      "orgOwnershipPercent": 75.0,
      "totalPointsForOwners": 96,
      "isStartingForAllOwners": false,
      "captainCount": 3
    }
  ],
  "totalMembers": 8
}
```

**Cache**: `revalidate: 3600`

---

## Suggestions

### `GET /api/suggestions/transfers?managerId={id}&gw={gameweekId}`

Returns ranked transfer suggestions for a member ahead of a gameweek.

**Response**:
```json
{
  "managerId": 67890,
  "gameweekId": 29,
  "freeTransfers": 2,
  "bank": 5,
  "suggestions": [
    {
      "rank": 1,
      "type": "transfer",
      "playerOut": {
        "id": 410,
        "webName": "Watkins",
        "nowCost": 85,
        "status": "i",
        "news": "Hamstring injury - expected to miss 3-4 weeks"
      },
      "playerIn": {
        "id": 382,
        "webName": "Isak",
        "nowCost": 84,
        "form": "8.5",
        "upcomingFdr": 2.0
      },
      "isFreeTransfer": true,
      "reasoning": "Watkins is injured and likely to miss multiple gameweeks. Isak has excellent upcoming fixtures (FDR avg 2.0 over 3 GWs) and strong recent form.",
      "score": 94.2
    }
  ]
}
```

**Cache**: `revalidate: 300` (5 minutes; suggestions reflect current player status)

---

### `GET /api/suggestions/captain?managerId={id}&gw={gameweekId}`

Returns ranked captain suggestions from the member's current squad.

**Response**:
```json
{
  "managerId": 67890,
  "gameweekId": 29,
  "suggestions": [
    {
      "rank": 1,
      "type": "captain",
      "player": {
        "id": 283,
        "webName": "Salah",
        "teamShortName": "LIV",
        "form": "9.2",
        "status": "a",
        "news": ""
      },
      "fixture": {
        "opponent": "EVE",
        "isHome": true,
        "difficulty": 2,
        "isDgw": false
      },
      "isDifferential": false,
      "orgOwnershipPercent": 75.0,
      "reasoning": "Salah is in outstanding form (9.2) with a favourable home fixture (FDR 2). Safe captain pick with high organisation ownership.",
      "score": 88.4
    }
  ]
}
```

**Cache**: `revalidate: 300`

---

### `GET /api/suggestions/chips?managerId={id}`

Returns chip timing recommendations for all unused chips.

**Response**:
```json
{
  "managerId": 67890,
  "chips": {
    "benchBoost": {
      "available": true,
      "recommendedGameweek": 33,
      "reasoning": "GW33 gives 3 of your bench players Double Gameweek fixtures, maximising bench score potential.",
      "expectedBenchPoints": 42
    },
    "tripleCaptain": {
      "available": true,
      "recommendedGameweek": 33,
      "reasoning": "Salah has a Double Gameweek in GW33. Triple Captain expected to yield ~30 points vs the usual ~20.",
      "expectedUplift": 10
    },
    "wildcard": {
      "available": true,
      "recommendedGameweek": null,
      "reasoning": "No strong trigger detected yet. Consider using if 3+ players become injured or your rank drops significantly.",
      "trigger": null
    },
    "freeHit": {
      "available": false,
      "usedInGameweek": 20,
      "reasoning": null
    }
  },
  "orgChipUsage": [
    {
      "managerId": 67890,
      "displayName": "Tom K",
      "benchBoostUsed": false,
      "tripleCaptainUsed": false,
      "wildcardUsed": false,
      "freeHitUsed": true
    }
  ]
}
```

**Cache**: `revalidate: 3600`

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `ORG_NOT_CONFIGURED` | 404 | Organisation has not been set up yet |
| `MEMBER_NOT_FOUND` | 404 | No member with the given managerId in this org |
| `MANAGER_PRIVATE` | 403 | FPL manager's team is set to private; picks unavailable |
| `FPL_API_UNAVAILABLE` | 503 | FPL API is unreachable or returned an error |
| `GAMEWEEK_NOT_FOUND` | 404 | Requested gameweek ID does not exist |
| `MEMBER_ALREADY_EXISTS` | 409 | Attempted to add a member with a duplicate managerId |
| `INVALID_LEAGUE_ID` | 422 | The provided mini-league ID does not exist on FPL |
