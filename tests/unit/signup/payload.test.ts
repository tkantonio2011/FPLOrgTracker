/**
 * Unit tests for src/lib/signup/payload.ts.
 */

import { describe, it, expect } from "vitest";
import { selfSignupPayloadSchema } from "@/lib/signup/payload";

describe("selfSignupPayloadSchema", () => {
  const valid = {
    leagueName: "The Sunday Crew",
    miniLeagueId: 12345,
    fplVerifiedAt: "2026-05-22T10:00:00.000Z",
  };

  it("accepts a fully-valid payload", () => {
    const result = selfSignupPayloadSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts fplVerifiedAt = null (FPL inconclusive)", () => {
    const result = selfSignupPayloadSchema.safeParse({ ...valid, fplVerifiedAt: null });
    expect(result.success).toBe(true);
  });

  it("rejects an empty leagueName", () => {
    const result = selfSignupPayloadSchema.safeParse({ ...valid, leagueName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a leagueName that is only whitespace", () => {
    const result = selfSignupPayloadSchema.safeParse({ ...valid, leagueName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects miniLeagueId = 0", () => {
    const result = selfSignupPayloadSchema.safeParse({ ...valid, miniLeagueId: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects miniLeagueId = -5", () => {
    const result = selfSignupPayloadSchema.safeParse({ ...valid, miniLeagueId: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects miniLeagueId at or above the 1e8 ceiling", () => {
    const result = selfSignupPayloadSchema.safeParse({ ...valid, miniLeagueId: 100_000_000 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO fplVerifiedAt string", () => {
    const result = selfSignupPayloadSchema.safeParse({ ...valid, fplVerifiedAt: "yesterday" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing miniLeagueId", () => {
    const { miniLeagueId, ...rest } = valid;
    void miniLeagueId;
    const result = selfSignupPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing fplVerifiedAt (null must be explicit)", () => {
    const { fplVerifiedAt, ...rest } = valid;
    void fplVerifiedAt;
    const result = selfSignupPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
