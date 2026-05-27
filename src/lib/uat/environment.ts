/**
 * Environment detection for the UAT / production / development split.
 *
 * APP_ENV is a tri-state env var read once at module load. Production builds
 * and UAT builds use the SAME `next build` artefacts; the active environment
 * is decided at runtime by `process.env.APP_ENV`. See:
 *   - specs/004-uat-deployment/contracts/env-vars.md
 *   - specs/004-uat-deployment/research.md §R1, §R14
 *
 * Fails loudly on invalid input — silently defaulting to "production" or
 * "uat" would either expose data or lock testers out, both of which the
 * spec explicitly forbids.
 */

import { z } from "zod";

const ENV_SCHEMA = z.enum(["production", "uat", "development"]);

export type EnvironmentName = z.infer<typeof ENV_SCHEMA>;

export interface EnvironmentConfig {
  readonly name: EnvironmentName;
  readonly isUat: boolean;
  readonly appUrl: string | null;
}

function parse(): EnvironmentConfig {
  const raw = process.env.APP_ENV;
  const result = ENV_SCHEMA.safeParse(raw ?? "development");
  if (!result.success) {
    throw new Error(
      `APP_ENV must be one of "production" | "uat" | "development" — got ${JSON.stringify(raw)}`,
    );
  }
  const name = result.data;

  // The 004 spec previously refused to start production with a non-empty
  // UAT_ALLOWED_EMAILS — that safeguard protected against a misconfigured
  // production silently entering allow-list mode. Feature 005 retired the
  // allow-list entirely (see 005 FR-017), so the safeguard has nothing to
  // protect and has been removed.

  return Object.freeze({
    name,
    isUat: name === "uat",
    appUrl: process.env.APP_URL ?? null,
  });
}

let cached: EnvironmentConfig | null = null;

function load(): EnvironmentConfig {
  if (cached === null) cached = parse();
  return cached;
}

/** True when running on the UAT instance. False in production and development. */
export function isUat(): boolean {
  return load().isUat;
}

/** The active environment name. */
export function environmentName(): EnvironmentName {
  return load().name;
}

/** Frozen snapshot of the resolved environment configuration. */
export function getEnvironmentConfig(): EnvironmentConfig {
  return load();
}

/**
 * Internal test hook — clears the cached config so the next call re-parses
 * `process.env`. Used only by unit tests; never call from application code.
 */
export function __resetEnvironmentCacheForTests(): void {
  cached = null;
}
