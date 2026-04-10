import type {
  FplElement,
  FplFixture,
  FplTeam,
  FplEntryPicks,
} from "@/lib/fpl/types";

export interface TransferSuggestion {
  rank: number;
  type: "transfer";
  playerOut: {
    id: number;
    webName: string;
    nowCost: number;
    status: string;
    news: string;
    form: string;
    avgFdr: number;
  };
  playerIn: {
    id: number;
    webName: string;
    nowCost: number;
    form: string;
    upcomingFdr: number;
    teamShortName: string;
    status: string;
  };
  isFreeTransfer: boolean;
  reasoning: string;
  score: number;
}

function getTeamShortName(teams: FplTeam[], teamId: number): string {
  return teams.find((t) => t.id === teamId)?.short_name ?? String(teamId);
}

/**
 * Compute weighted average FDR for the next 3 GWs for a given team.
 * Weights: GW+1 × 3, GW+2 × 2, GW+3 × 1, divided by 6.
 */
function computeAvgFdr(
  teamId: number,
  fixtures: FplFixture[],
  currentGw: number
): number {
  const upcoming = fixtures
    .filter(
      (f) =>
        f.event !== null &&
        f.event > currentGw &&
        !f.finished &&
        (f.team_h === teamId || f.team_a === teamId)
    )
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0))
    .slice(0, 3);

  if (upcoming.length === 0) return 3; // neutral default

  const weights = [3, 2, 1];
  let weightedSum = 0;
  let totalWeight = 0;

  upcoming.forEach((f, i) => {
    const w = weights[i] ?? 1;
    const difficulty =
      f.team_h === teamId ? f.team_h_difficulty : f.team_a_difficulty;
    weightedSum += difficulty * w;
    totalWeight += w;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : 3;
}

export function generateTransferSuggestions(params: {
  picks: FplEntryPicks;
  elements: FplElement[];
  teams: FplTeam[];
  fixtures: FplFixture[];
  bank: number; // tenths of £
  freeTransfers: number;
  currentGw: number;
}): TransferSuggestion[] {
  const { picks, elements, teams, fixtures, bank, freeTransfers, currentGw } =
    params;

  const elementMap = new Map<number, FplElement>(elements.map((e) => [e.id, e]));
  const squadIds = new Set(picks.picks.map((p) => p.element));

  // Step 1: Score each squad player for weakness
  const weakPlayers: Array<{
    element: FplElement;
    weakness: number;
    avgFdr: number;
  }> = [];

  for (const pick of picks.picks) {
    const player = elementMap.get(pick.element);
    if (!player) continue;

    let weakness = 0;

    if (player.status === "i" || player.status === "s") {
      weakness = 100;
    } else {
      if (player.status === "d") {
        weakness += 30;
      }

      const avgFdr = computeAvgFdr(player.team, fixtures, currentGw);
      weakness += avgFdr * 10;

      const form = parseFloat(player.form) || 0;
      weakness += (5 - form) * 5;

      weakPlayers.push({ element: player, weakness, avgFdr });
      continue;
    }

    const avgFdr = computeAvgFdr(player.team, fixtures, currentGw);
    weakPlayers.push({ element: player, weakness, avgFdr });
  }

  // Step 2: Sort by weakness descending, take top 3
  weakPlayers.sort((a, b) => b.weakness - a.weakness);
  const top3Weak = weakPlayers.slice(0, 3);

  // Step 3: Find replacements
  const suggestions: TransferSuggestion[] = [];

  for (const { element: playerOut, weakness, avgFdr } of top3Weak) {
    const budget = playerOut.now_cost + bank;

    // Find candidates: same position, not in squad, within budget, available
    const candidates = elements
      .filter(
        (el) =>
          el.element_type === playerOut.element_type &&
          !squadIds.has(el.id) &&
          el.now_cost <= budget &&
          (el.status === "a" || el.status === "d")
      )
      .sort((a, b) => {
        const scoreA = a.now_cost > 0 ? a.total_points / a.now_cost : 0;
        const scoreB = b.now_cost > 0 ? b.total_points / b.now_cost : 0;
        return scoreB - scoreA;
      })
      .slice(0, 3);

    for (const candidate of candidates) {
      const candidateAvgFdr = computeAvgFdr(
        candidate.team,
        fixtures,
        currentGw
      );

      // Combined score: weakness of player out + value of player in
      const candidateValueScore =
        candidate.now_cost > 0
          ? candidate.total_points / candidate.now_cost
          : 0;
      const score = weakness + candidateValueScore * 10;

      // Build reasoning
      let reasoningParts: string[] = [];

      if (playerOut.status === "i") {
        reasoningParts.push(`${playerOut.web_name} is injured.`);
      } else if (playerOut.status === "s") {
        reasoningParts.push(`${playerOut.web_name} is suspended.`);
      } else if (playerOut.status === "d") {
        reasoningParts.push(`${playerOut.web_name} is doubtful.`);
      } else {
        const outForm = parseFloat(playerOut.form) || 0;
        if (avgFdr >= 4) {
          reasoningParts.push(
            `${playerOut.web_name} has difficult upcoming fixtures (avg FDR ${avgFdr.toFixed(1)}).`
          );
        } else if (outForm < 2) {
          reasoningParts.push(`${playerOut.web_name} is out of form (${playerOut.form}).`);
        }
      }

      const inForm = parseFloat(candidate.form) || 0;
      const fdrLabel =
        candidateAvgFdr <= 2.5
          ? "excellent"
          : candidateAvgFdr <= 3.5
          ? "decent"
          : "tough";

      reasoningParts.push(
        `${candidate.web_name} has ${fdrLabel} upcoming fixtures (avg FDR ${candidateAvgFdr.toFixed(1)}) and ${
          inForm >= 7 ? "strong" : inForm >= 4 ? "decent" : "moderate"
        } form (${candidate.form}).`
      );

      suggestions.push({
        rank: 0, // assigned later
        type: "transfer",
        playerOut: {
          id: playerOut.id,
          webName: playerOut.web_name,
          nowCost: playerOut.now_cost,
          status: playerOut.status,
          news: playerOut.news,
          form: playerOut.form,
          avgFdr,
        },
        playerIn: {
          id: candidate.id,
          webName: candidate.web_name,
          nowCost: candidate.now_cost,
          form: candidate.form,
          upcomingFdr: candidateAvgFdr,
          teamShortName: getTeamShortName(teams, candidate.team),
          status: candidate.status,
        },
        isFreeTransfer: false, // assigned below
        reasoning: reasoningParts.join(" "),
        score,
      });
    }
  }

  // Step 4: Sort by score, assign ranks and free transfer flag
  suggestions.sort((a, b) => b.score - a.score);
  const top5 = suggestions.slice(0, 5);

  top5.forEach((s, idx) => {
    s.rank = idx + 1;
    s.isFreeTransfer = idx + 1 <= freeTransfers;
  });

  return top5;
}
