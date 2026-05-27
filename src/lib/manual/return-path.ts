/**
 * Validation + display helpers for the `?return=<path>` query parameter
 * the contextual `<HelpButton>` writes when navigating into the manual.
 *
 * Trust boundary: the raw value is attacker-controllable. Treat as untrusted,
 * sanitise before any href / DOM reflection, and fall back to "/" on doubt.
 *
 * Contract: specs/003-user-manual/data-model.md → ReturnPath section.
 */

const MAX_LENGTH = 1024;

/**
 * Returns a safe in-app relative path or "/" if the input is missing,
 * malformed, or could be parsed as an external URL.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (decoded.length > MAX_LENGTH) return "/";
  if (!decoded.startsWith("/")) return "/";
  // Reject protocol-relative URLs (`//evil.example/...`).
  if (decoded.startsWith("//")) return "/";
  // Reject anything that could be parsed as an external URL via backslash or colon.
  if (/[\\:]/.test(decoded)) return "/";
  // Reject control characters that could mess with header / URL parsing.
  if (/[\x00-\x1f\x7f]/.test(decoded)) return "/";
  return decoded;
}

/**
 * Render-time mapping from a sanitised return-path to a human-readable name
 * used in the "Back to <pretty name>" link rendered by `<TopicView>`.
 *
 * Unknown paths fall back to "where you were". Keep this small and intentional —
 * the goal is recognisability for the common feature pages, not an exhaustive
 * registry of every route.
 */
export function prettyNameForPath(path: string): string {
  // Strip query string and trailing slash for matching.
  const clean = path.split("?")[0]!.replace(/\/$/, "");

  // Match against the per-league analytics surfaces using a regex so any
  // league slug works.
  const leaguePageMatch = clean.match(/^\/l\/[^/]+\/([^/]+)(?:\/.*)?$/);
  if (leaguePageMatch) {
    const segment = leaguePageMatch[1]!;
    const named = PAGE_NAMES[segment];
    if (named) return named;
    if (segment === "admin") return "Admin";
    return "where you were";
  }

  if (clean === "/leagues") return "Leagues";
  if (clean === "/my-admin") return "My admin leagues";
  if (clean === "/platform") return "Platform";
  if (clean === "" || clean === "/") return "where you were";
  return "where you were";
}

const PAGE_NAMES: Record<string, string> = {
  standings: "Standings",
  live: "Live Points",
  transfers: "Transfers",
  form: "Form Table",
  "season-stats": "Season Stats",
  bench: "Bench Waste",
  "captain-history": "Captain History",
  h2h: "H2H Battle",
  regret: "Transfer Regret",
  agony: "Agony Index",
  luck: "Luck Ranking",
  "captain-whatif": "Captain What-If",
  "wall-of-shame": "Wall of Shame",
  fixtures: "Fixtures",
  ownership: "Ownership",
  differentials: "Differentials",
  "player-status": "Injuries",
};
