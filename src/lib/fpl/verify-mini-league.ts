/**
 * FPL mini-league verifier for the public sign-up flow.
 *
 * Calls the public FPL classic-league endpoint with a strict timeout so the
 * sign-up form never blocks the user on a slow or unreachable FPL API.
 * Returns a discriminated-union result so callers must handle every branch.
 *
 * Contract: specs/005-public-signup/contracts/signup-endpoint.md
 * Research: specs/005-public-signup/research.md §R2
 */

const FPL_BASE = "https://fantasy.premierleague.com/api";
const FPL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; FPLOrgTracker/1.0; +https://github.com)",
};

const DEFAULT_TIMEOUT_MS = 3000;

export type VerifyResult =
  | { kind: "verified"; name: string }
  | { kind: "no_such_league" }
  | { kind: "inconclusive"; reason: "timeout" | "network" | "malformed" };

export interface VerifyOptions {
  timeoutMs?: number;
}

interface LeagueStandingsResponse {
  league?: { name?: unknown } | null;
}

export async function verifyFplMiniLeague(
  id: number,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${FPL_BASE}/leagues-classic/${id}/standings/?page_standings=1`, {
      cache: "no-store",
      headers: FPL_HEADERS,
      signal: controller.signal,
    });

    if (res.status === 404) {
      return { kind: "no_such_league" };
    }
    if (!res.ok) {
      return { kind: "inconclusive", reason: "network" };
    }

    const body = (await res.json()) as LeagueStandingsResponse;
    const name = body.league?.name;
    if (typeof name !== "string" || name.length === 0) {
      return { kind: "inconclusive", reason: "malformed" };
    }
    return { kind: "verified", name };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { kind: "inconclusive", reason: "timeout" };
    }
    return { kind: "inconclusive", reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}
