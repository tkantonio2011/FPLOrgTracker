import type { FplFixture, FplElement, FplPick } from "@/lib/fpl/types";

export interface ChipRecommendation {
  available: boolean;
  usedInGameweek?: number;
  recommendedGameweek: number | null;
  reasoning: string;
  expectedUplift?: number;
}

export interface ChipSuggestions {
  benchBoost: ChipRecommendation;
  tripleCaptain: ChipRecommendation;
  wildcard: ChipRecommendation;
  freeHit: ChipRecommendation;
}

export interface OrgChipUsage {
  managerId: number;
  displayName: string;
  benchBoostUsed: boolean;
  tripleCaptainUsed: boolean;
  wildcardUsed: boolean;
  freeHitUsed: boolean;
}

/**
 * Detect which gameweeks are Double Gameweeks (DGW) — a team plays twice.
 * Returns a Map<teamId, Set<gwId>> of teams and the GWs where they have doubles.
 */
export function detectDgwTeams(
  fixtures: FplFixture[]
): Map<number, Set<number>> {
  const teamGwCounts = new Map<string, number>();

  for (const f of fixtures) {
    if (f.event === null) continue;
    const hKey = `${f.team_h}-${f.event}`;
    const aKey = `${f.team_a}-${f.event}`;
    teamGwCounts.set(hKey, (teamGwCounts.get(hKey) ?? 0) + 1);
    teamGwCounts.set(aKey, (teamGwCounts.get(aKey) ?? 0) + 1);
  }

  const dgwMap = new Map<number, Set<number>>();
  Array.from(teamGwCounts.entries()).forEach(([key, count]) => {
    if (count >= 2) {
      const [teamId, gwId] = key.split("-").map(Number);
      if (!dgwMap.has(teamId)) dgwMap.set(teamId, new Set());
      dgwMap.get(teamId)!.add(gwId);
    }
  });
  return dgwMap;
}

/**
 * Detect Blank Gameweek teams — teams with no fixtures in a given GW.
 * Returns Set<teamId> for each GW.
 */
export function detectBgwTeams(
  fixtures: FplFixture[],
  allTeamIds: number[],
  gw: number
): Set<number> {
  const teamsWithFixtures = new Set<number>();
  for (const f of fixtures) {
    if (f.event === gw) {
      teamsWithFixtures.add(f.team_h);
      teamsWithFixtures.add(f.team_a);
    }
  }
  const blank = new Set<number>();
  for (const teamId of allTeamIds) {
    if (!teamsWithFixtures.has(teamId)) blank.add(teamId);
  }
  return blank;
}

function getPlayerTeam(playerId: number, elements: FplElement[]): number | null {
  return elements.find((e) => e.id === playerId)?.team ?? null;
}

function getPlayerForm(playerId: number, elements: FplElement[]): number {
  const el = elements.find((e) => e.id === playerId);
  return parseFloat(el?.form ?? "0");
}

/**
 * Find the best gameweek for Bench Boost — the one where bench players have the
 * highest expected points (by form), prioritising DGW for bench players.
 */
export function scoreBenchBoost(params: {
  picks: FplPick[];
  elements: FplElement[];
  fixtures: FplFixture[];
  currentGw: number;
  upcomingGws: number[];
}): ChipRecommendation {
  const { picks, elements, fixtures, currentGw, upcomingGws } = params;
  const benchPicks = picks.filter((p) => p.position > 11);
  const dgwTeams = detectDgwTeams(fixtures);

  let bestGw: number | null = null;
  let bestScore = -Infinity;

  for (const gw of upcomingGws) {
    if (gw <= currentGw) continue;
    let gwScore = 0;
    let dgwBonusCount = 0;

    for (const pick of benchPicks) {
      const teamId = getPlayerTeam(pick.element, elements);
      const form = getPlayerForm(pick.element, elements);
      const hasDgw = teamId ? dgwTeams.get(teamId)?.has(gw) ?? false : false;
      gwScore += form * (hasDgw ? 1.8 : 1.0);
      if (hasDgw) dgwBonusCount++;
    }

    if (gwScore > bestScore) {
      bestScore = gwScore;
      bestGw = gw;
    }
  }

  const dgwText =
    bestGw && dgwTeams
      ? (() => {
          const count = benchPicks.filter((p) => {
            const teamId = getPlayerTeam(p.element, elements);
            return teamId ? dgwTeams.get(teamId)?.has(bestGw!) ?? false : false;
          }).length;
          return count > 0 ? ` ${count} of your bench players have Double Gameweek fixtures.` : "";
        })()
      : "";

  return {
    available: true,
    recommendedGameweek: bestGw,
    reasoning: bestGw
      ? `GW${bestGw} looks ideal for Bench Boost based on your bench players' form.${dgwText}`
      : "No strong Bench Boost gameweek identified yet. Wait for DGW announcements.",
    expectedUplift: bestScore > 0 ? Math.round(bestScore) : undefined,
  };
}

/**
 * Find the best gameweek for Triple Captain — highest expected captain score,
 * prioritising DGW for the best captain candidate.
 */
export function scoreTripleCaptain(params: {
  picks: FplPick[];
  elements: FplElement[];
  fixtures: FplFixture[];
  currentGw: number;
  upcomingGws: number[];
}): ChipRecommendation {
  const { picks, elements, fixtures, currentGw, upcomingGws } = params;
  const startingPicks = picks.filter((p) => p.position <= 11);
  const dgwTeams = detectDgwTeams(fixtures);

  // Find best captain candidate: highest form in starting XI
  const bestPlayer = startingPicks.reduce(
    (best, pick) => {
      const form = getPlayerForm(pick.element, elements);
      return form > best.form ? { id: pick.element, form } : best;
    },
    { id: 0, form: -1 }
  );

  if (bestPlayer.id === 0) {
    return { available: true, recommendedGameweek: null, reasoning: "No captain candidate found." };
  }

  const teamId = getPlayerTeam(bestPlayer.id, elements);
  const playerEl = elements.find((e) => e.id === bestPlayer.id);
  const playerName = playerEl?.web_name ?? `Player ${bestPlayer.id}`;

  // Find the best upcoming GW for this player
  let bestGw: number | null = null;
  let hasDgw = false;

  for (const gw of upcomingGws) {
    if (gw <= currentGw) continue;
    const isDgw = teamId ? dgwTeams.get(teamId)?.has(gw) ?? false : false;
    if (isDgw) {
      bestGw = gw;
      hasDgw = true;
      break;
    }
  }

  if (!bestGw) {
    // No DGW — recommend next GW
    bestGw = upcomingGws.find((g) => g > currentGw) ?? null;
  }

  const uplift = hasDgw
    ? Math.round(bestPlayer.form * 3 * 1.8 - bestPlayer.form * 2)
    : Math.round(bestPlayer.form * 3 - bestPlayer.form * 2);

  return {
    available: true,
    recommendedGameweek: bestGw,
    reasoning: bestGw
      ? `${playerName} is your best captain candidate (form ${bestPlayer.form.toFixed(1)}).${hasDgw ? ` GW${bestGw} is a Double Gameweek — tripling the captain return could yield an extra ${uplift} pts.` : ""}`
      : "Consider playing Triple Captain in a gameweek where your best player has an easy fixture.",
    expectedUplift: uplift,
  };
}

/**
 * Wildcard trigger logic — recommend when squad is underperforming.
 * Triggers when: many injured/suspended players, or hard upcoming fixtures for many squad players.
 */
export function scoreWildcard(params: {
  picks: FplPick[];
  elements: FplElement[];
  fixtures: FplFixture[];
  currentGw: number;
  upcomingGws: number[];
}): ChipRecommendation {
  const { picks, elements, fixtures, currentGw, upcomingGws } = params;

  const injuredCount = picks.filter((p) => {
    const el = elements.find((e) => e.id === p.element);
    return el?.status === "i" || el?.status === "s";
  }).length;

  const hardFixtureCount = picks
    .filter((p) => p.position <= 11)
    .filter((p) => {
      const teamId = getPlayerTeam(p.element, elements);
      if (!teamId) return false;
      const nextGw = upcomingGws.find((g) => g > currentGw);
      if (!nextGw) return false;
      const fix = fixtures.find(
        (f) =>
          f.event === nextGw &&
          (f.team_h === teamId || f.team_a === teamId)
      );
      if (!fix) return false;
      const difficulty = fix.team_h === teamId ? fix.team_h_difficulty : fix.team_a_difficulty;
      return difficulty >= 4;
    }).length;

  let reasoning = "";
  let shouldTrigger = false;
  let triggerGw: number | null = null;

  if (injuredCount >= 3) {
    shouldTrigger = true;
    reasoning = `You have ${injuredCount} injured or suspended players in your squad — a Wildcard could give you a fresh start.`;
    triggerGw = upcomingGws.find((g) => g > currentGw) ?? null;
  } else if (hardFixtureCount >= 4) {
    shouldTrigger = true;
    reasoning = `${hardFixtureCount} of your starting XI face difficult fixtures (FDR 4-5) next gameweek. A Wildcard would let you restructure for better fixtures.`;
    triggerGw = upcomingGws.find((g) => g > currentGw) ?? null;
  } else {
    reasoning =
      "No strong Wildcard trigger detected. Save it for when 3+ players are injured or a large Double Gameweek is approaching.";
  }

  return {
    available: true,
    recommendedGameweek: triggerGw,
    reasoning,
  };
}

/**
 * Free Hit trigger — recommend for confirmed BGWs affecting many squad players.
 */
export function scoreFreeHit(params: {
  picks: FplPick[];
  elements: FplElement[];
  fixtures: FplFixture[];
  currentGw: number;
  upcomingGws: number[];
  allTeamIds: number[];
}): ChipRecommendation {
  const { picks, elements, fixtures, currentGw, upcomingGws, allTeamIds } = params;

  let bestGw: number | null = null;
  let maxBlankCount = 0;

  for (const gw of upcomingGws) {
    if (gw <= currentGw) continue;
    const bgwTeams = detectBgwTeams(fixtures, allTeamIds, gw);
    const blankCount = picks
      .filter((p) => p.position <= 11)
      .filter((p) => {
        const teamId = getPlayerTeam(p.element, elements);
        return teamId ? bgwTeams.has(teamId) : false;
      }).length;

    if (blankCount > maxBlankCount) {
      maxBlankCount = blankCount;
      bestGw = gw;
    }
  }

  const shouldTrigger = maxBlankCount >= 4;

  return {
    available: true,
    recommendedGameweek: shouldTrigger ? bestGw : null,
    reasoning: shouldTrigger
      ? `GW${bestGw} is a Blank Gameweek affecting ${maxBlankCount} of your starting XI. Free Hit lets you field a full team.`
      : "No significant Blank Gameweek detected for your squad. Keep Free Hit available for BGWs.",
  };
}
