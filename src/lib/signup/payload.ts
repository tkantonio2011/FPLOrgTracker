/**
 * Self-signup payload — the desired-league fields carried on a
 * `MagicLinkToken` of `purpose = "self_signup"` between form submission and
 * magic-link click. Validated on every read.
 *
 * Contract: specs/005-public-signup/contracts/self-signup-token.md
 */

import { z } from "zod";
import { leagueNameSchema } from "@/lib/validation";

export const selfSignupPayloadSchema = z.object({
  leagueName: leagueNameSchema,
  miniLeagueId: z.number().int().positive().lt(100_000_000),
  // ISO-8601 timestamp when the FPL API confirmed the league exists at form
  // submission. `null` means the FPL API was unreachable at submission time;
  // the resulting `League` row will be created with `miniLeagueUnverified = true`.
  fplVerifiedAt: z.string().datetime().nullable(),
});

export type SelfSignupPayload = z.infer<typeof selfSignupPayloadSchema>;
