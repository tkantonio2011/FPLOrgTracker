import type { FplElement, FplFixture, FplTeam, FplPick } from "@/lib/fpl/types";

export interface CaptainSuggestion {
  rank: number;
  type: "captain";
  player: {
    id: number;
    webName: string;
    teamShortName: string;
    form: string;
    status: string;
    news: string;
    elementType: number;
  };
  fixture: {
    opponent: string;
    isHome: boolean;
    difficulty: number;
    isDgw: boolean;
  };
  isDifferential: boolean;
  orgOwnershipPercent: number;
  reasoning: string;
  score: number;
}

function getTeamShortName(teamId: number, teams: FplTeam[]): string {
  return teams.find((t) => t.id === teamId)?.short_name ?? "???";
}

function getUpcomingFixture(
  teamId: number,
  currentGw: number,
  fixtures: FplFixture[],
  teams: FplTeam[]
): { opponent: string; isHome: boolean; difficulty: number; isDgw: boolean } | null {
  const teamFixtures = fixtures
    .filter((f) => f.event !== null && f.event >= currentGw && (f.team_h === teamId || f.team_a === teamId))
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0));

  if (teamFixtures.length === 0) return null;

  const next = teamFixtures[0];
  const isHome = next.team_h === teamId;
  const opponent = getTeamShortName(isHome ? next.team_a : next.team_h, teams);
  const difficulty = isHome ? next.team_h_difficulty : next.team_a_difficulty;

  // DGW: same team has 2+ fixtures in the same event
  const nextGw = next.event!;
  const dwFixtures = teamFixtures.filter((f) => f.event === nextGw);
  const isDgw = dwFixtures.length >= 2;

  return { opponent, isHome, difficulty, isDgw };
}

export function generateCaptainSuggestions(params: {
  picks: FplPick[];
  elements: FplElement[];
  teams: FplTeam[];
  fixtures: FplFixture[];
  currentGw: number;
  orgOwnership: Map<number, number>;
  orgMemberCount: number;
}): CaptainSuggestion[] {
  const { picks, elements, teams, fixtures, currentGw, orgOwnership, orgMemberCount } = params;

  // Only consider starting XI
  const startingPicks = picks.filter((p) => p.position <= 11);

  const scored: { suggestion: CaptainSuggestion; score: number }[] = [];

  for (const pick of startingPicks) {
    const el = elements.find((e) => e.id === pick.element);
    if (!el) continue;

    const form = parseFloat(el.form ?? "0");
    if (form === 0) continue;

    const fixture = getUpcomingFixture(el.team, currentGw, fixtures, teams);
    if (!fixture) continue;

    const fixtureBonusDivisor = 4;
    const fixtureBonus = (5 - fixture.difficulty) / fixtureDivisorClamp(fixture.difficulty);
    const homeMultiplier = fixture.isHome ? 1.15 : 0.9;

    // minutes_reliability: starts / games played estimate
    const gamesPlayed = el.minutes > 0 ? Math.max(1, Math.round(el.minutes / 90)) : 1;
    const minutesReliability = Math.min(1, el.minutes / (gamesPlayed * 90));

    const dgwMultiplier = fixture.isDgw ? 1.8 : 1.0;
    const score = form * fixtureBonus * homeMultiplier * minutesReliability * dgwMultiplier;

    const ownerCount = orgOwnership.get(el.id) ?? 0;
    const orgOwnershipPercent =
      orgMemberCount > 0 ? Math.round((ownerCount / orgMemberCount) * 1000) / 10 : 0;
    const isDifferential = ownerCount <= 1;

    const reasonParts: string[] = [
      `${el.web_name} is in ${form >= 7 ? "outstanding" : "decent"} form (${form.toFixed(1)})`,
      `${fixture.isHome ? "home" : "away"} fixture vs ${fixture.opponent} (FDR ${fixture.difficulty})`,
    ];
    if (fixture.isDgw) reasonParts.push("Double Gameweek opportunity");
    if (isDifferential && orgMemberCount > 2) reasonParts.push("differential pick");
    const reasoning = reasonParts.join(", ") + ".";

    scored.push({
      score,
      suggestion: {
        rank: 0,
        type: "captain",
        player: {
          id: el.id,
          webName: el.web_name,
          teamShortName: getTeamShortName(el.team, teams),
          form: el.form,
          status: el.status,
          news: el.news,
          elementType: el.element_type,
        },
        fixture,
        isDifferential,
        orgOwnershipPercent,
        reasoning,
        score,
      },
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s, i) => ({ ...s.suggestion, rank: i + 1 }));
}

function fixtureDivisorClamp(difficulty: number): number {
  // Map difficulty 1-5 to fixture_bonus 1.0 -> 0.25
  return Math.max(1, difficulty);
}
